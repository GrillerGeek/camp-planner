import { SupabaseClient } from "@supabase/supabase-js";
import {
  GroceryItem,
  GroceryList,
  GroceryListWithItems,
  GroceryProgress,
} from "@/lib/types/inventory";

// ============================================================
// Unit conversion helpers
// ============================================================

const UNIT_ALIASES: Record<string, string> = {
  lb: "lbs",
  pound: "lbs",
  pounds: "lbs",
  ounce: "oz",
  ounces: "oz",
  gram: "g",
  grams: "g",
  kilogram: "kg",
  kilograms: "kg",
  cup: "cups",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  liter: "liters",
  litre: "liters",
  litres: "liters",
  milliliter: "ml",
  milliliters: "ml",
  can: "cans",
  bottle: "bottles",
  bag: "bags",
  box: "boxes",
};

function normalizeUnit(unit: string | null | undefined): string {
  if (!unit) return "";
  const lower = unit.toLowerCase().trim();
  return UNIT_ALIASES[lower] ?? lower;
}

// Conversion to a base unit (grams for weight, ml for volume)
const TO_GRAMS: Record<string, number> = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lbs: 453.592,
};

const TO_ML: Record<string, number> = {
  ml: 1,
  liters: 1000,
  cups: 240,
  tbsp: 15,
  tsp: 5,
};

function convertQuantity(
  qty: number,
  fromUnit: string,
  toUnit: string
): number | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return qty;

  // Weight conversions
  if (TO_GRAMS[from] && TO_GRAMS[to]) {
    return (qty * TO_GRAMS[from]) / TO_GRAMS[to];
  }
  // Volume conversions
  if (TO_ML[from] && TO_ML[to]) {
    return (qty * TO_ML[from]) / TO_ML[to];
  }

  return null; // incompatible units
}

// Unit families bucket together units that can be summed via convertQuantity.
// Within a family, quantities convert cleanly; across families they cannot,
// so we emit separate grocery rows. Containers (cans, bottles, bags...) each
// get their own family — "2 cans tomato sauce" should not merge with
// "1 bottle tomato sauce" because they describe distinct products.
function getUnitFamily(normalizedUnit: string): string {
  if (normalizedUnit === "") return "count";
  if (TO_GRAMS[normalizedUnit] !== undefined) return "weight";
  if (TO_ML[normalizedUnit] !== undefined) return "volume";
  return normalizedUnit;
}

function aggKey(normalizedName: string, family: string): string {
  return `${normalizedName}|${family}`;
}

function normalizeIngredientName(name: string): string {
  return name.toLowerCase().trim();
}

// ============================================================
// Grocery list CRUD
// ============================================================

export async function getTripGroceryList(
  supabase: SupabaseClient,
  tripId: string
): Promise<GroceryListWithItems | null> {
  const { data, error } = await supabase
    .from("trip_grocery_lists")
    .select("*, trip_grocery_items(*)")
    .eq("trip_id", tripId)
    .maybeSingle();

  // maybeSingle() returns { data: null, error: null } for 0 rows — no PGRST116
  // and, crucially, no console 406 from a .single() Accept-header mismatch.
  if (error) throw error;

  return data;
}

export interface GroceryStaleness {
  isStale: boolean;
  hasMealPlan: boolean;
  hasGroceryItems: boolean;
}

/**
 * "Stale" means: there is a meal plan AND the grocery list has items AND
 * meals have changed since the last regeneration (or never been generated).
 * Empty lists and trips without a meal plan are not surfaced as stale.
 */
export async function getGroceryStaleness(
  supabase: SupabaseClient,
  tripId: string
): Promise<GroceryStaleness> {
  const [{ data: plan }, { data: list }] = await Promise.all([
    supabase
      .from("trip_meal_plans")
      .select("meals_changed_at")
      .eq("trip_id", tripId)
      .maybeSingle(),
    supabase
      .from("trip_grocery_lists")
      .select("last_generated_at, trip_grocery_items(id)")
      .eq("trip_id", tripId)
      .maybeSingle(),
  ]);

  const hasMealPlan = !!plan;
  const itemCount =
    (list?.trip_grocery_items as { id: string }[] | undefined)?.length ?? 0;
  const hasGroceryItems = itemCount > 0;

  if (!hasMealPlan || !hasGroceryItems) {
    return { isStale: false, hasMealPlan, hasGroceryItems };
  }

  if (!list?.last_generated_at) {
    // Items exist but were never tagged with a generation time (e.g.,
    // generated before migration 015). Not stale per se — surface the
    // banner only if meals actually changed since the list's updated_at.
    return { isStale: false, hasMealPlan, hasGroceryItems };
  }

  const isStale =
    new Date(plan.meals_changed_at).getTime() >
    new Date(list.last_generated_at).getTime();

  return { isStale, hasMealPlan, hasGroceryItems };
}

async function getOrCreateGroceryList(
  supabase: SupabaseClient,
  tripId: string
): Promise<GroceryList> {
  // Try to get existing. maybeSingle() so a not-yet-created list returns null
  // instead of a 406 (the .single() Accept-header mismatch on 0 rows).
  const { data: existing } = await supabase
    .from("trip_grocery_lists")
    .select("*")
    .eq("trip_id", tripId)
    .maybeSingle();

  if (existing) return existing;

  // Create new
  const { data, error } = await supabase
    .from("trip_grocery_lists")
    .insert({ trip_id: tripId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================================
// Generate grocery list from meal plan
// ============================================================

interface AggregatedIngredient {
  name: string;
  normalizedName: string;
  family: string;
  quantity: number;
  unit: string;
  category: string;
  sourceRecipes: string[];
}

/**
 * Aggregate ingredients across a trip's recipe-linked meals (unit-family
 * bucketed) and subtract non-expired camper inventory. Pure read — performs no
 * writes. Shared by generateGroceryListFromMeals (which then persists the rows)
 * and the unified "Generate from meals" proposal flow (which shows them for
 * review before saving). Returns one entry per (ingredient, unit-family).
 */
export async function computeRecipeProposals(
  supabase: SupabaseClient,
  tripId: string
): Promise<AggregatedIngredient[]> {
  const { data: mealPlan } = await supabase
    .from("trip_meal_plans")
    .select("id")
    .eq("trip_id", tripId)
    .maybeSingle();

  const aggregated = new Map<string, AggregatedIngredient>();

  if (mealPlan) {
    const { data: meals } = await supabase
      .from("trip_meals")
      .select("*, recipes(*)")
      .eq("meal_plan_id", mealPlan.id);

    if (meals) {
      for (const meal of meals) {
        const recipe = meal.recipes;
        if (!recipe || !recipe.ingredients) continue;

        const ingredients = Array.isArray(recipe.ingredients)
          ? recipe.ingredients
          : [];

        for (const ing of ingredients) {
          if (!ing.name) continue;
          const normName = normalizeIngredientName(ing.name);
          const unit = normalizeUnit(ing.unit);
          const family = getUnitFamily(unit);
          const qty = Number(ing.quantity) || 1;
          const key = aggKey(normName, family);

          const existing = aggregated.get(key);
          if (existing) {
            // Same family — convertQuantity will always have a path.
            const converted = convertQuantity(qty, unit, existing.unit);
            existing.quantity += converted ?? qty;
            if (recipe.name && !existing.sourceRecipes.includes(recipe.name)) {
              existing.sourceRecipes.push(recipe.name);
            }
          } else {
            aggregated.set(key, {
              name: ing.name,
              normalizedName: normName,
              family,
              quantity: qty,
              unit,
              category: ing.category || "Other",
              sourceRecipes: recipe.name ? [recipe.name] : [],
            });
          }
        }
      }
    }
  }

  // Subtract inventory (excluding expired items).
  const { data: inventory } = await supabase
    .from("camper_inventory")
    .select("*");

  // Local-date string (YYYY-MM-DD) from local midnight — NOT toISOString(),
  // which would misclassify items expiring today for users west of UTC.
  const localNow = new Date();
  const today = `${localNow.getFullYear()}-${String(
    localNow.getMonth() + 1
  ).padStart(2, "0")}-${String(localNow.getDate()).padStart(2, "0")}`;

  if (inventory) {
    for (const invItem of inventory) {
      if (invItem.expiration_date && invItem.expiration_date < today) continue;

      const normName = normalizeIngredientName(invItem.name);
      const invUnit = normalizeUnit(invItem.unit);
      const invFamily = getUnitFamily(invUnit);
      const invQty = Number(invItem.quantity) || 0;
      const key = aggKey(normName, invFamily);

      const agg = aggregated.get(key);
      if (!agg) continue;

      const converted = convertQuantity(invQty, invUnit, agg.unit);
      agg.quantity -= converted ?? invQty;

      if (agg.quantity <= 0) {
        aggregated.delete(key);
      }
    }
  }

  return Array.from(aggregated.values());
}

export async function generateGroceryListFromMeals(
  supabase: SupabaseClient,
  tripId: string
): Promise<GroceryListWithItems> {
  // 1. Get or create the grocery list
  const groceryList = await getOrCreateGroceryList(supabase, tripId);

  // 2. Get existing purchased states to preserve across regeneration.
  // Manual items are preserved via the `is_manual = false` filter on the
  // delete step (5) below, so they don't need to be tracked here.
  const { data: existingItems } = await supabase
    .from("trip_grocery_items")
    .select("*")
    .eq("grocery_list_id", groceryList.id);

  // Keyed by (name, family) so a "2 cups flour" purchase isn't accidentally
  // inherited by "1 lb flour".
  const purchasedMap = new Map<string, boolean>();
  (existingItems ?? []).forEach((item: GroceryItem) => {
    const normName = normalizeIngredientName(item.name);
    const family = getUnitFamily(normalizeUnit(item.unit));
    purchasedMap.set(aggKey(normName, family), item.is_purchased);
  });

  // 3-4. Aggregate recipe ingredients across linked meals, minus inventory.
  const proposals = await computeRecipeProposals(supabase, tripId);

  // 5. Delete old auto-generated items
  await supabase
    .from("trip_grocery_items")
    .delete()
    .eq("grocery_list_id", groceryList.id)
    .eq("is_manual", false);

  // 6. Insert new auto-generated items
  const newItems: Omit<GroceryItem, "id">[] = [];
  let sortOrder = 0;

  for (const agg of proposals) {
    const prevPurchased =
      purchasedMap.get(aggKey(agg.normalizedName, agg.family)) ?? false;
    newItems.push({
      grocery_list_id: groceryList.id,
      name: agg.name,
      quantity: Math.round(agg.quantity * 100) / 100,
      unit: agg.unit || null,
      category: agg.category,
      is_purchased: prevPurchased,
      is_manual: false,
      source_recipe: agg.sourceRecipes.join(", ") || null,
      notes: null,
      sort_order: sortOrder++,
      added_to_inventory_at: null,
    });
  }

  if (newItems.length > 0) {
    const { error: insertError } = await supabase
      .from("trip_grocery_items")
      .insert(newItems);
    if (insertError) throw insertError;
  }

  // Stamp the generation time so getGroceryStaleness can detect drift.
  await supabase
    .from("trip_grocery_lists")
    .update({ last_generated_at: new Date().toISOString() })
    .eq("id", groceryList.id);

  // 7. Fetch and return the complete list
  const result = await getTripGroceryList(supabase, tripId);
  if (!result) throw new Error("Failed to fetch grocery list after generation");
  return result;
}

// ============================================================
// Individual item operations
// ============================================================

export async function addGroceryItem(
  supabase: SupabaseClient,
  tripId: string,
  item: {
    name: string;
    quantity?: number;
    unit?: string;
    category?: string;
  }
): Promise<GroceryItem> {
  const groceryList = await getOrCreateGroceryList(supabase, tripId);

  const newName = item.name.trim();
  const newUnit = item.unit?.trim() || null;
  const newQty = item.quantity ?? 1;

  // SPEC-006b.3: dedupe against existing rows on the same list by
  // (lower(name), lower(unit ?? '')). If found, fold the new quantity
  // into the existing row instead of inserting a duplicate. Unit family
  // is intentionally NOT used here — the user typed a unit, and we
  // trust an exact match; cross-family ("2 cups flour" vs "1 lb flour")
  // gets two rows, which is the correct shopping outcome.
  const { data: existingRows } = await supabase
    .from("trip_grocery_items")
    .select("*")
    .eq("grocery_list_id", groceryList.id);

  const match = (existingRows ?? []).find((row: GroceryItem) => {
    const rowName = (row.name ?? "").toLowerCase().trim();
    const rowUnit = (row.unit ?? "").toLowerCase().trim();
    return (
      rowName === newName.toLowerCase() &&
      rowUnit === (newUnit ?? "").toLowerCase()
    );
  });

  if (match) {
    const { data: updated, error: updateError } = await supabase
      .from("trip_grocery_items")
      .update({
        quantity: match.quantity + newQty,
        // Preserve is_manual if either source was manual — used downstream
        // by the regenerate dedupe.
        is_manual: match.is_manual || true,
      })
      .eq("id", match.id)
      .select()
      .single();
    if (updateError) throw updateError;
    return updated;
  }

  const { data, error } = await supabase
    .from("trip_grocery_items")
    .insert({
      grocery_list_id: groceryList.id,
      name: newName,
      quantity: newQty,
      unit: newUnit,
      category: item.category || "Other",
      is_manual: true,
      is_purchased: false,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function togglePurchased(
  supabase: SupabaseClient,
  itemId: string,
  isPurchased: boolean
): Promise<void> {
  const { error } = await supabase
    .from("trip_grocery_items")
    .update({ is_purchased: isPurchased })
    .eq("id", itemId);

  if (error) throw error;
}

export async function deleteGroceryItem(
  supabase: SupabaseClient,
  itemId: string
): Promise<void> {
  const { error } = await supabase
    .from("trip_grocery_items")
    .delete()
    .eq("id", itemId);

  if (error) throw error;
}

export async function getGroceryProgress(
  supabase: SupabaseClient,
  tripId: string
): Promise<GroceryProgress | null> {
  const { data: groceryList } = await supabase
    .from("trip_grocery_lists")
    .select("id")
    .eq("trip_id", tripId)
    .maybeSingle();

  if (!groceryList) return null;

  const { data: items } = await supabase
    .from("trip_grocery_items")
    .select("is_purchased")
    .eq("grocery_list_id", groceryList.id);

  if (!items || items.length === 0) return null;

  return {
    total: items.length,
    purchased: items.filter((i: { is_purchased: boolean }) => i.is_purchased)
      .length,
  };
}

// ============================================================
// Post-trip reconciliation
// ============================================================

export interface ReconciliationItem {
  groceryItemName: string;
  quantity: number;
  unit: string | null;
  inventoryItemId: string | null;
  currentInventoryQty: number;
  deductQty: number;
}

export async function getReconciliationData(
  supabase: SupabaseClient,
  tripId: string
): Promise<ReconciliationItem[]> {
  const groceryList = await getTripGroceryList(supabase, tripId);
  if (!groceryList) return [];

  const purchasedItems = groceryList.trip_grocery_items.filter(
    (item) => item.is_purchased
  );

  const { data: inventory } = await supabase
    .from("camper_inventory")
    .select("*");

  const inventoryMap = new Map<
    string,
    { id: string; quantity: number; unit: string | null }
  >();
  if (inventory) {
    for (const inv of inventory) {
      inventoryMap.set(normalizeIngredientName(inv.name), {
        id: inv.id,
        quantity: Number(inv.quantity),
        unit: inv.unit,
      });
    }
  }

  return purchasedItems.map((item) => {
    const normName = normalizeIngredientName(item.name);
    const inv = inventoryMap.get(normName);
    return {
      groceryItemName: item.name,
      quantity: item.quantity,
      unit: item.unit,
      inventoryItemId: inv?.id ?? null,
      currentInventoryQty: inv?.quantity ?? 0,
      deductQty: item.quantity,
    };
  });
}

export async function applyReconciliation(
  supabase: SupabaseClient,
  updates: { inventoryItemId: string; newQuantity: number }[],
  deletions: string[]
): Promise<void> {
  // Delete items reduced to zero
  for (const id of deletions) {
    await supabase.from("camper_inventory").delete().eq("id", id);
  }

  // Update quantities
  for (const update of updates) {
    if (update.newQuantity <= 0) {
      await supabase
        .from("camper_inventory")
        .delete()
        .eq("id", update.inventoryItemId);
    } else {
      await supabase
        .from("camper_inventory")
        .update({ quantity: update.newQuantity })
        .eq("id", update.inventoryItemId);
    }
  }
}

// ============================================================
// SPEC-006b.4: add purchased grocery items to camper inventory
// ============================================================
// This is the "I bought new stuff at the store, put it in my camper
// inventory" path — distinct from the trip-completion reconcile that
// decrements inventory by consumed amounts. Idempotent via
// trip_grocery_items.added_to_inventory_at.

export interface AddToInventoryResult {
  inserted: number;
  merged: number;
  itemsAdded: number;
}

export async function getUnaddedPurchasedItems(
  supabase: SupabaseClient,
  tripId: string
): Promise<GroceryItem[]> {
  const groceryList = await getTripGroceryList(supabase, tripId);
  if (!groceryList) return [];
  return groceryList.trip_grocery_items.filter(
    (item) => item.is_purchased && !item.added_to_inventory_at
  );
}

/**
 * Adds all purchased-but-not-yet-added grocery items to the camper
 * inventory. If an inventory row with the same lower(name) exists, the
 * quantity is summed onto that row; otherwise a new row is inserted.
 * Marks each grocery item's added_to_inventory_at so repeat clicks are
 * no-ops.
 */
export async function addPurchasedToInventory(
  supabase: SupabaseClient,
  tripId: string
): Promise<AddToInventoryResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const groceryList = await getTripGroceryList(supabase, tripId);
  if (!groceryList) return { inserted: 0, merged: 0, itemsAdded: 0 };

  const toAdd = groceryList.trip_grocery_items.filter(
    (item) => item.is_purchased && !item.added_to_inventory_at
  );
  if (toAdd.length === 0) return { inserted: 0, merged: 0, itemsAdded: 0 };

  const { data: inventory } = await supabase
    .from("camper_inventory")
    .select("id, name, quantity");

  const invByName = new Map<
    string,
    { id: string; quantity: number }
  >();
  for (const inv of inventory ?? []) {
    invByName.set(normalizeIngredientName(inv.name), {
      id: inv.id,
      quantity: Number(inv.quantity),
    });
  }

  let inserted = 0;
  let merged = 0;

  for (const item of toAdd) {
    const existing = invByName.get(normalizeIngredientName(item.name));
    if (existing) {
      const { error } = await supabase
        .from("camper_inventory")
        .update({ quantity: existing.quantity + item.quantity })
        .eq("id", existing.id);
      if (error) throw error;
      existing.quantity += item.quantity;
      merged += 1;
    } else {
      const { data: created, error } = await supabase
        .from("camper_inventory")
        .insert({
          name: item.name,
          category: item.category || "Other",
          quantity: item.quantity,
          unit: item.unit,
          created_by: user.id,
        })
        .select("id, name, quantity")
        .single();
      if (error) throw error;
      if (created) {
        invByName.set(normalizeIngredientName(created.name), {
          id: created.id,
          quantity: Number(created.quantity),
        });
      }
      inserted += 1;
    }
  }

  // Mark the grocery items as added so the action is idempotent.
  const itemIds = toAdd.map((i) => i.id);
  const { error: stampError } = await supabase
    .from("trip_grocery_items")
    .update({ added_to_inventory_at: new Date().toISOString() })
    .in("id", itemIds);
  if (stampError) throw stampError;

  return { inserted, merged, itemsAdded: toAdd.length };
}

// ============================================================
// Bulk commit for reviewed AI suggestions (SPEC: AI grocery from meals)
// ============================================================
// The AiGenerateModal decides per item whether to insert a new row or merge
// quantity into an existing one (the user's skip/merge choice on duplicates).
// This helper just applies those two pre-computed sets. AI items are written
// with is_manual = true so a later deterministic "Regenerate from Meals"
// (which deletes is_manual = false rows) does not wipe them.

export interface BulkGroceryInsert {
  name: string;
  quantity: number;
  unit: string | null;
  category: string;
}

export interface BulkAddGroceryArgs {
  toInsert: BulkGroceryInsert[];
  toMerge: { id: string; addQuantity: number }[];
}

export async function bulkAddGroceryItems(
  supabase: SupabaseClient,
  tripId: string,
  { toInsert, toMerge }: BulkAddGroceryArgs
): Promise<GroceryItem[]> {
  const groceryList = await getOrCreateGroceryList(supabase, tripId);

  // Append new rows after whatever is already on the list.
  const { data: existingRows } = await supabase
    .from("trip_grocery_items")
    .select("sort_order")
    .eq("grocery_list_id", groceryList.id);
  let sortOrder =
    (existingRows ?? []).reduce(
      (max: number, r: { sort_order: number }) => Math.max(max, r.sort_order),
      -1
    ) + 1;

  const result: GroceryItem[] = [];

  if (toInsert.length > 0) {
    const rows = toInsert.map((item) => ({
      grocery_list_id: groceryList.id,
      name: item.name.trim(),
      quantity: item.quantity,
      unit: item.unit?.trim() || null,
      category: item.category || "Other",
      is_manual: true,
      is_purchased: false,
      source_recipe: "AI suggested",
      sort_order: sortOrder++,
    }));
    const { data: inserted, error } = await supabase
      .from("trip_grocery_items")
      .insert(rows)
      .select();
    if (error) throw error;
    result.push(...((inserted ?? []) as GroceryItem[]));
  }

  for (const merge of toMerge) {
    const { data: current } = await supabase
      .from("trip_grocery_items")
      .select("quantity")
      .eq("id", merge.id)
      .maybeSingle();
    const newQty = (Number(current?.quantity) || 0) + merge.addQuantity;
    const { data: updated, error } = await supabase
      .from("trip_grocery_items")
      .update({ quantity: newQty })
      .eq("id", merge.id)
      .select()
      .single();
    if (error) throw error;
    if (updated) result.push(updated as GroceryItem);
  }

  return result;
}
