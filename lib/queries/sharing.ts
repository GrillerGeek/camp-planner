import { SupabaseClient } from "@supabase/supabase-js";
import { TripShareLink, SharedTripData, SharedMeal, SharedPackingItem, SharedTask } from "@/lib/types/sharing";

export async function createShareLink(
  supabase: SupabaseClient,
  tripId: string
): Promise<TripShareLink> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("trip_share_links")
    .insert({
      trip_id: tripId,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getShareLinksForTrip(
  supabase: SupabaseClient,
  tripId: string
): Promise<TripShareLink[]> {
  const { data, error } = await supabase
    .from("trip_share_links")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function revokeShareLink(
  supabase: SupabaseClient,
  linkId: string
): Promise<void> {
  const { error } = await supabase
    .from("trip_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId);

  if (error) throw error;
}

/**
 * Fetch trip data via a share token. Uses server-side supabase client.
 * Returns null if the token is invalid or revoked.
 */
export async function getTripByShareToken(
  supabase: SupabaseClient,
  token: string
): Promise<SharedTripData | null> {
  // Look up the share link by token
  const { data: shareLink, error: linkError } = await supabase
    .from("trip_share_links")
    .select("*")
    .eq("token", token)
    .is("revoked_at", null)
    .single();

  if (linkError || !shareLink) return null;

  const tripId = shareLink.trip_id;

  // Fetch trip data
  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("name, destination, start_date, end_date, campsite_info, status")
    .eq("id", tripId)
    .single();

  if (tripError || !trip) return null;

  // Fetch planner name (created_by on the share link)
  let plannerName = "A planner";
  if (shareLink.created_by) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", shareLink.created_by)
      .single();
    if (profile?.display_name) {
      plannerName = profile.display_name;
    }
  }

  // Fetch meals
  const meals = await fetchSharedMeals(supabase, tripId);

  // Fetch packing items
  const packingItems = await fetchSharedPackingItems(supabase, tripId);

  // Fetch tasks
  const tasks = await fetchSharedTasks(supabase, tripId);

  return {
    trip,
    planner_name: plannerName,
    meals,
    packing_items: packingItems,
    tasks,
  };
}

async function fetchSharedMeals(
  supabase: SupabaseClient,
  tripId: string
): Promise<SharedMeal[]> {
  const { data: mealPlan } = await supabase
    .from("trip_meal_plans")
    .select("id, trip_meals(id, day_date, meal_type, custom_meal_name, notes, recipes(name))")
    .eq("trip_id", tripId)
    .order("day_date", { referencedTable: "trip_meals", ascending: true })
    .limit(1)
    .maybeSingle();

  if (!mealPlan?.trip_meals) return [];

  const tripMeals = mealPlan.trip_meals as unknown as Array<{
    id: string;
    day_date: string;
    meal_type: string;
    custom_meal_name: string | null;
    notes: string | null;
    recipes: { name: string }[] | { name: string } | null;
  }>;

  return tripMeals.map((m) => {
    const recipe = Array.isArray(m.recipes) ? m.recipes[0] : m.recipes;
    return {
      id: m.id,
      day_date: m.day_date,
      meal_type: m.meal_type,
      custom_meal_name: m.custom_meal_name,
      notes: m.notes,
      recipe_name: recipe?.name ?? null,
    };
  });
}

async function fetchSharedPackingItems(
  supabase: SupabaseClient,
  tripId: string
): Promise<SharedPackingItem[]> {
  const { data: packingList } = await supabase
    .from("trip_packing_lists")
    .select("id, trip_packing_items(id, name, category, quantity, is_packed, assigned_to)")
    .eq("trip_id", tripId)
    .order("sort_order", { referencedTable: "trip_packing_items", ascending: true })
    .limit(1)
    .maybeSingle();

  if (!packingList?.trip_packing_items) return [];

  // Collect unique assigned_to IDs to resolve names
  const items = packingList.trip_packing_items as Array<{
    id: string;
    name: string;
    category: string;
    quantity: number;
    is_packed: boolean;
    assigned_to: string | null;
  }>;

  const userIds = [...new Set(items.filter((i) => i.assigned_to).map((i) => i.assigned_to!))];
  const nameMap = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);

    if (profiles) {
      for (const p of profiles) {
        nameMap.set(p.id, p.display_name ?? "Unknown");
      }
    }
  }

  return items.map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
    quantity: i.quantity,
    is_packed: i.is_packed,
    assigned_to_name: i.assigned_to ? (nameMap.get(i.assigned_to) ?? "Unknown") : null,
  }));
}

async function fetchSharedTasks(
  supabase: SupabaseClient,
  tripId: string
): Promise<SharedTask[]> {
  const { data: tasks } = await supabase
    .from("trip_tasks")
    .select("id, title, description, assigned_to, due_date, priority, is_completed")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true });

  if (!tasks || tasks.length === 0) return [];

  const userIds = [...new Set(tasks.filter((t) => t.assigned_to).map((t) => t.assigned_to!))];
  const nameMap = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);

    if (profiles) {
      for (const p of profiles) {
        nameMap.set(p.id, p.display_name ?? "Unknown");
      }
    }
  }

  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    assigned_to_name: t.assigned_to ? (nameMap.get(t.assigned_to) ?? "Unknown") : null,
    due_date: t.due_date,
    priority: t.priority,
    is_completed: t.is_completed,
  }));
}
