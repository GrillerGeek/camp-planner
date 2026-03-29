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
    notes?: string;
    assigned_to?: string | null;
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
      notes: item.notes?.trim() || null,
      assigned_to: item.assigned_to || null,
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
    assigned_to: string | null;
    notes: string;
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
// AUTO-POPULATE FROM TEMPLATES
// ============================================================

/**
 * Derive the season from a date string (YYYY-MM-DD).
 * Uses meteorological seasons in the Northern Hemisphere.
 */
export function getSeasonFromDate(dateStr: string): string {
  const month = new Date(dateStr).getMonth() + 1; // 1-12
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "fall";
  return "winter";
}

/**
 * Find templates matching a trip's season (derived from dates) and trip type.
 * Returns all matching templates, or all templates if none match.
 */
export async function findMatchingTemplates(
  supabase: SupabaseClient,
  tripStartDate: string,
  tripEndDate: string
): Promise<PackingTemplateWithItems[]> {
  const startSeason = getSeasonFromDate(tripStartDate);
  const endSeason = getSeasonFromDate(tripEndDate);
  const seasons = Array.from(new Set([startSeason, endSeason]));

  // Get all templates with items
  const { data: templates, error } = await supabase
    .from("packing_templates")
    .select("*, packing_template_items(*)")
    .order("name");

  if (error) throw error;
  if (!templates || templates.length === 0) return [];

  // Filter to those that match the season
  const matching = templates.filter((t: PackingTemplateWithItems) => {
    if (t.seasons.length === 0) return true; // No season tag = universal
    return t.seasons.some((s) => seasons.includes(s));
  });

  // If no matches, return all templates
  return matching.length > 0 ? matching : templates;
}

/**
 * Auto-populate a trip's packing list from matching templates.
 * Merges items from multiple templates, deduplicating by (category, name).
 */
export async function autoPopulateFromTemplates(
  supabase: SupabaseClient,
  tripId: string,
  tripStartDate: string,
  tripEndDate: string
): Promise<TripPackingListWithItems> {
  const templates = await findMatchingTemplates(
    supabase,
    tripStartDate,
    tripEndDate
  );

  // Get or create the packing list
  const list = await getOrCreateTripPackingList(supabase, tripId);

  if (templates.length === 0) {
    // Return the empty list
    return { ...list, trip_packing_items: [] };
  }

  // Merge items from all templates, deduplicate by (category, name lowercase)
  const seen = new Set<string>();
  const itemsToInsert: {
    packing_list_id: string;
    name: string;
    category: string;
    quantity: number;
    notes: string | null;
    sort_order: number;
  }[] = [];

  let sortOrder = 0;
  for (const template of templates) {
    for (const item of template.packing_template_items || []) {
      const key = `${item.category.toLowerCase()}::${item.name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      itemsToInsert.push({
        packing_list_id: list.id,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
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

  // Return the full list with items
  const result = await getTripPackingList(supabase, tripId);
  return result ?? { ...list, trip_packing_items: [] };
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
