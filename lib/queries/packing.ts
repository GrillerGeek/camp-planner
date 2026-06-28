import { SupabaseClient } from "@supabase/supabase-js";
import {
  PackingTemplate,
  PackingTemplateWithItems,
  PackingTemplateItem,
  TripPackingList,
  TripPackingItem,
  TripPackingListWithItems,
} from "@/lib/types/packing";

// ============================================================
// TEMPLATES
// ============================================================

export async function getPackingTemplates(
  supabase: SupabaseClient
): Promise<(PackingTemplate & { item_count: number })[]> {
  const { data, error } = await supabase
    .from("packing_templates")
    .select("*, packing_template_items(count)")
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map(
    (t: PackingTemplate & { packing_template_items: { count: number }[] }) => ({
      ...t,
      item_count: t.packing_template_items?.[0]?.count ?? 0,
    })
  );
}

export async function getTemplateById(
  supabase: SupabaseClient,
  templateId: string
): Promise<PackingTemplateWithItems | null> {
  const { data, error } = await supabase
    .from("packing_templates")
    .select("*, packing_template_items(*)")
    .eq("id", templateId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return data;
}

export async function createTemplate(
  supabase: SupabaseClient,
  template: {
    name: string;
    description?: string;
    seasons: string[];
    trip_types: string[];
  }
): Promise<PackingTemplate> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("packing_templates")
    .insert({
      name: template.name.trim(),
      description: template.description?.trim() || null,
      seasons: template.seasons,
      trip_types: template.trip_types,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTemplate(
  supabase: SupabaseClient,
  templateId: string,
  template: {
    name?: string;
    description?: string;
    seasons?: string[];
    trip_types?: string[];
  }
): Promise<PackingTemplate> {
  const updateData: Record<string, unknown> = {};
  if (template.name !== undefined) updateData.name = template.name.trim();
  if (template.description !== undefined)
    updateData.description = template.description.trim() || null;
  if (template.seasons !== undefined) updateData.seasons = template.seasons;
  if (template.trip_types !== undefined)
    updateData.trip_types = template.trip_types;

  const { data, error } = await supabase
    .from("packing_templates")
    .update(updateData)
    .eq("id", templateId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTemplate(
  supabase: SupabaseClient,
  templateId: string
): Promise<void> {
  const { error } = await supabase
    .from("packing_templates")
    .delete()
    .eq("id", templateId);
  if (error) throw error;
}

// ============================================================
// TEMPLATE ITEMS
// ============================================================

export async function addTemplateItem(
  supabase: SupabaseClient,
  item: {
    template_id: string;
    name: string;
    category: string;
    is_essential?: boolean;
    quantity?: number;
    notes?: string;
    sort_order?: number;
  }
): Promise<PackingTemplateItem> {
  const { data, error } = await supabase
    .from("packing_template_items")
    .insert({
      template_id: item.template_id,
      name: item.name.trim(),
      category: item.category,
      is_essential: item.is_essential ?? false,
      quantity: item.quantity ?? 1,
      notes: item.notes?.trim() || null,
      sort_order: item.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTemplateItem(
  supabase: SupabaseClient,
  itemId: string,
  updates: Partial<{
    name: string;
    category: string;
    is_essential: boolean;
    quantity: number;
    notes: string;
    sort_order: number;
  }>
): Promise<PackingTemplateItem> {
  const { data, error } = await supabase
    .from("packing_template_items")
    .update(updates)
    .eq("id", itemId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTemplateItem(
  supabase: SupabaseClient,
  itemId: string
): Promise<void> {
  const { error } = await supabase
    .from("packing_template_items")
    .delete()
    .eq("id", itemId);
  if (error) throw error;
}

// ============================================================
// TRIP PACKING LISTS
// ============================================================

export async function getTripPackingList(
  supabase: SupabaseClient,
  tripId: string
): Promise<TripPackingListWithItems | null> {
  const { data, error } = await supabase
    .from("trip_packing_lists")
    .select("*, trip_packing_items(*)")
    .eq("trip_id", tripId)
    .order("sort_order", {
      referencedTable: "trip_packing_items",
      ascending: true,
    })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getOrCreateTripPackingList(
  supabase: SupabaseClient,
  tripId: string
): Promise<TripPackingList> {
  // Try to get existing list first
  const { data: existing } = await supabase
    .from("trip_packing_lists")
    .select("*")
    .eq("trip_id", tripId)
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  // Create new list
  const { data, error } = await supabase
    .from("trip_packing_lists")
    .insert({ trip_id: tripId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function addPackingItem(
  supabase: SupabaseClient,
  item: {
    packing_list_id: string;
    name: string;
    category: string;
    quantity?: number;
    is_essential?: boolean;
    notes?: string;
    assignees?: string[];
    sort_order?: number;
  }
): Promise<TripPackingItem> {
  const { data, error } = await supabase
    .from("trip_packing_items")
    .insert({
      packing_list_id: item.packing_list_id,
      name: item.name.trim(),
      category: item.category,
      quantity: item.quantity ?? 1,
      is_essential: item.is_essential ?? false,
      notes: item.notes?.trim() || null,
      assignees: item.assignees ?? [],
      sort_order: item.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updatePackingItem(
  supabase: SupabaseClient,
  itemId: string,
  updates: Partial<{
    name: string;
    category: string;
    quantity: number;
    is_packed: boolean;
    is_essential: boolean;
    assignees: string[];
    notes: string | null;
    sort_order: number;
  }>
): Promise<TripPackingItem> {
  const { data, error } = await supabase
    .from("trip_packing_items")
    .update(updates)
    .eq("id", itemId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function togglePacked(
  supabase: SupabaseClient,
  itemId: string,
  isPacked: boolean
): Promise<TripPackingItem> {
  const { data, error } = await supabase
    .from("trip_packing_items")
    .update({ is_packed: isPacked })
    .eq("id", itemId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deletePackingItem(
  supabase: SupabaseClient,
  itemId: string
): Promise<void> {
  const { error } = await supabase
    .from("trip_packing_items")
    .delete()
    .eq("id", itemId);
  if (error) throw error;
}

// ============================================================
// APPLY TEMPLATE TO TRIP
// ============================================================

/**
 * Apply a single, explicitly chosen template to a trip's packing list.
 * Merges with existing items, deduping by (category, name lowercase) — so
 * applying the same template twice is a no-op, and applying a second template
 * adds only the new items. Carries is_essential and notes through.
 */
export async function applyPackingTemplate(
  supabase: SupabaseClient,
  tripId: string,
  templateId: string
): Promise<TripPackingListWithItems> {
  const list = await getOrCreateTripPackingList(supabase, tripId);

  const { data: template, error } = await supabase
    .from("packing_templates")
    .select("*, packing_template_items(*)")
    .eq("id", templateId)
    .single();
  if (error) throw error;
  if (!template) {
    return (await getTripPackingList(supabase, tripId)) ?? { ...list, trip_packing_items: [] };
  }

  return mergeTemplateItemsIntoList(supabase, tripId, list.id, [
    template as PackingTemplateWithItems,
  ]);
}

/**
 * Merge template items into an existing packing list. Existing trip items are
 * read first and used to dedup by (category, name lowercase) — so the operation
 * is idempotent and safe to re-run.
 */
async function mergeTemplateItemsIntoList(
  supabase: SupabaseClient,
  tripId: string,
  listId: string,
  templates: PackingTemplateWithItems[]
): Promise<TripPackingListWithItems> {
  const { data: existing } = await supabase
    .from("trip_packing_items")
    .select("name, category, sort_order")
    .eq("packing_list_id", listId);

  const seen = new Set<string>(
    (existing ?? []).map(
      (i: { name: string; category: string }) =>
        `${i.category.toLowerCase()}::${i.name.toLowerCase()}`
    )
  );
  let sortOrder =
    (existing ?? []).reduce(
      (max: number, i: { sort_order: number }) => Math.max(max, i.sort_order),
      -1
    ) + 1;

  const itemsToInsert: {
    packing_list_id: string;
    name: string;
    category: string;
    quantity: number;
    is_essential: boolean;
    notes: string | null;
    sort_order: number;
  }[] = [];

  for (const template of templates) {
    for (const item of template.packing_template_items || []) {
      const key = `${item.category.toLowerCase()}::${item.name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      itemsToInsert.push({
        packing_list_id: listId,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        is_essential: item.is_essential,
        notes: item.notes,
        sort_order: sortOrder++,
      });
    }
  }

  if (itemsToInsert.length > 0) {
    const { error } = await supabase
      .from("trip_packing_items")
      .insert(itemsToInsert);
    if (error) throw error;
  }

  const result = await getTripPackingList(supabase, tripId);
  return result ?? { ...(await getOrCreateTripPackingList(supabase, tripId)), trip_packing_items: [] };
}

// ============================================================
// TRIP MEMBERS (for assignment dropdown)
// ============================================================

export async function getTripMembers(
  supabase: SupabaseClient,
  tripId: string
): Promise<{ user_id: string; display_name: string; role: string }[]> {
  const { data, error } = await supabase
    .from("trip_members")
    .select("user_id, role, profiles(display_name)")
    .eq("trip_id", tripId);

  if (error) throw error;

  return (data ?? []).map(
    (m: {
      user_id: string;
      role: string;
      profiles: { display_name: string }[] | { display_name: string } | null;
    }) => {
      const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return {
        user_id: m.user_id,
        display_name: profile?.display_name ?? "Unknown",
        role: m.role,
      };
    }
  );
}

/**
 * Get packing progress for a trip (packed count / total count).
 * Returns { packed: number, total: number } or null if no packing list exists.
 */
export async function getPackingProgress(
  supabase: SupabaseClient,
  tripId: string
): Promise<{ packed: number; total: number } | null> {
  const { data, error } = await supabase
    .from("trip_packing_lists")
    .select("id, trip_packing_items(id, is_packed)")
    .eq("trip_id", tripId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const items = data.trip_packing_items ?? [];
  return {
    packed: items.filter((i: { is_packed: boolean }) => i.is_packed).length,
    total: items.length,
  };
}
