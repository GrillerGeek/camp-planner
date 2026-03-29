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
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return data;
}

async function getOrCreateGroceryList(
  supabase: SupabaseClient,
  tripId: string
): Promise<GroceryList> {
  // Try to get existing
  const { data: existing } = await supabase
    .from("trip_grocery_lists")
    .select("*")
    .eq("trip_id", tripId)
    .single();

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
  quantity: number;
  unit: string;
  category: string;
  sourceRecipes: string[];
}

export async function generateGroceryListFromMeals(
  supabase: SupabaseClient,
  tripId: string
): Promise<GroceryListWithItems> {
  // 1. Get or create the grocery list
  const groceryList = await getOrCreateGroceryList(supabase, tripId);

  // 2. Get existing manual items and purchased states to preserve
  const { data: existingItems } = await supabase
    .from("trip_grocery_items")
    .select("*")
    .eq("grocery_list_id", groceryList.id);

  const manualItems = (existingItems ?? []).filter(
    (item: GroceryItem) => item.is_manual
  );
  const purchasedMap = new Map<string, boolean>();
  (existingItems ?? []).forEach((item: GroceryItem) => {
    purchasedMap.set(normalizeIngredientName(item.name), item.is_purchased);
  });

  // 3. Get trip meals with linked recipes
  const { data: mealPlan } = await supabase
    .from("trip_meal_plans")
    .select("id")
    .eq("trip_id", tripId)
    .single();

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
          const qty = Number(ing.quantity) || 1;

          const existing = aggregated.get(normName);
          if (existing) {
            // Try to convert and add
            const converted = convertQuantity(qty, unit, existing.unit);
            if (converted !== null) {
              existing.quantity += converted;
            } else if (unit && !existing.unit) {
              existing.quantity += qty;
              existing.unit = unit;
            } else {
              existing.quantity += qty;
            }
            if (
              recipe.name &&
              !existing.sourceRecipes.includes(recipe.name)
            ) {
              existing.sourceRecipes.push(recipe.name);
            }
          } else {
            aggregated.set(normName, {
              name: ing.name,
              normalizedName: normName,
              quantity: qty,
              unit: unit,
              category: ing.category || "Other",
              sourceRecipes: recipe.name ? [recipe.name] : [],
            });
          }
        }
      }
    }
  }

  // 4. Subtract inventory (excluding expired items)
  const { data: inventory } = await supabase
    .from("camper_inventory")
    .select("*");

  const today = new Date().toISOString().split("T")[0];

  if (inventory) {
    for (const invItem of inventory) {
      // Skip expired items
      if (invItem.expiration_date && invItem.expiration_date < today) continue;

      const normName = normalizeIngredientName(invItem.name);
      const agg = aggregated.get(normName);
      if (!agg) continue;

      const invUnit = normalizeUnit(invItem.unit);
      const invQty = Number(invItem.quantity) || 0;

      const converted = convertQuantity(invQty, invUnit, agg.unit);
      if (converted !== null) {
        agg.quantity -= converted;
      } else if (!invUnit || !agg.unit) {
        agg.quantity -= invQty;
      }
      // If units are incompatible, don't subtract

      if (agg.quantity <= 0) {
        aggregated.delete(normName);
      }
    }
  }

  // 5. Delete old auto-generated items
  await supabase
    .from("trip_grocery_items")
    .delete()
    .eq("grocery_list_id", groceryList.id)
    .eq("is_manual", false);

  // 6. Insert new auto-generated items
  const newItems: Omit<GroceryItem, "id">[] = [];
  let sortOrder = 0;

  for (const agg of aggregated.values()) {
    const prevPurchased = purchasedMap.get(agg.normalizedName) ?? false;
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
    });
  }

  if (newItems.length > 0) {
    const { error: insertError } = await supabase
      .from("trip_grocery_items")
      .insert(newItems);
    if (insertError) throw insertError;
  }

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

  const { data, error } = await supabase
    .from("trip_grocery_items")
    .insert({
      grocery_list_id: groceryList.id,
      name: item.name.trim(),
      quantity: item.quantity ?? 1,
      unit: item.unit?.trim() || null,
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
    .single();

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
