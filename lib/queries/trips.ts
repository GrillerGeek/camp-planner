import { SupabaseClient } from "@supabase/supabase-js";
import { Trip, TripWithMemberCount, TripFormData } from "@/lib/types/trip";

export async function getTripsForUser(
  supabase: SupabaseClient
): Promise<TripWithMemberCount[]> {
  const { data, error } = await supabase
    .from("trips")
    .select("*, trip_members(count)")
    .order("start_date", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((trip: Trip & { trip_members: { count: number }[] }) => ({
    ...trip,
    member_count: trip.trip_members?.[0]?.count ?? 0,
  }));
}

export async function getTripById(
  supabase: SupabaseClient,
  tripId: string
): Promise<Trip | null> {
  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return data;
}

export async function createTrip(
  supabase: SupabaseClient,
  formData: TripFormData
): Promise<Trip> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .insert({
      name: formData.name.trim(),
      destination: formData.destination.trim(),
      start_date: formData.start_date,
      end_date: formData.end_date,
      campsite_info: formData.campsite_info.trim() || null,
      notes: formData.notes.trim() || null,
      trip_type: formData.trip_type || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (tripError) throw tripError;

  const { error: memberError } = await supabase.from("trip_members").insert({
    trip_id: trip.id,
    user_id: user.id,
    role: "planner",
  });

  if (memberError) throw memberError;

  return trip;
}

export async function updateTrip(
  supabase: SupabaseClient,
  tripId: string,
  formData: Partial<TripFormData>
): Promise<Trip> {
  const updateData: Record<string, unknown> = {};
  if (formData.name !== undefined) updateData.name = formData.name.trim();
  if (formData.destination !== undefined)
    updateData.destination = formData.destination.trim();
  if (formData.start_date !== undefined)
    updateData.start_date = formData.start_date;
  if (formData.end_date !== undefined) updateData.end_date = formData.end_date;
  if (formData.campsite_info !== undefined)
    updateData.campsite_info = formData.campsite_info.trim() || null;
  if (formData.notes !== undefined)
    updateData.notes = formData.notes.trim() || null;
  if (formData.trip_type !== undefined)
    updateData.trip_type = formData.trip_type || null;

  const { data, error } = await supabase
    .from("trips")
    .update(updateData)
    .eq("id", tripId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTrip(
  supabase: SupabaseClient,
  tripId: string
): Promise<{ deleted: boolean }> {
  const { error, count } = await supabase
    .from("trips")
    .delete({ count: "exact" })
    .eq("id", tripId);
  if (error) throw error;
  return { deleted: (count ?? 0) > 0 };
}

export async function getUserRoleForTrip(
  supabase: SupabaseClient,
  tripId: string
): Promise<"planner" | "viewer" | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("trip_members")
    .select("role")
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .single();

  if (error) return null;
  return data?.role ?? null;
}

// ============================================================
// Member management (SPEC-002b)
// ============================================================

export interface TripMemberDetailed {
  id: string;
  user_id: string;
  role: "planner" | "viewer";
  joined_at: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  is_creator: boolean;
}

export async function getTripMembersDetailed(
  supabase: SupabaseClient,
  tripId: string
): Promise<TripMemberDetailed[]> {
  const [{ data: members, error }, { data: trip }] = await Promise.all([
    supabase
      .from("trip_members")
      .select(
        "id, user_id, role, joined_at, profiles(display_name, email, avatar_url)"
      )
      .eq("trip_id", tripId)
      .order("joined_at", { ascending: true }),
    supabase.from("trips").select("created_by").eq("id", tripId).single(),
  ]);

  if (error) throw error;

  const creatorId = trip?.created_by ?? null;
  return (members ?? []).map(
    (m: {
      id: string;
      user_id: string;
      role: "planner" | "viewer";
      joined_at: string;
      profiles:
        | { display_name: string; email: string; avatar_url: string | null }[]
        | { display_name: string; email: string; avatar_url: string | null }
        | null;
    }) => {
      const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return {
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        joined_at: m.joined_at,
        display_name: profile?.display_name ?? "Unknown",
        email: profile?.email ?? "",
        avatar_url: profile?.avatar_url ?? null,
        is_creator: m.user_id === creatorId,
      };
    }
  );
}

export async function findProfileByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<{
  id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
} | null> {
  // ilike with no wildcards = case-insensitive equality. Supabase auth
  // tends to lowercase emails but we don't depend on it.
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, email, avatar_url")
    .ilike("email", email.trim())
    .maybeSingle();

  if (error) return null;
  return data;
}

export async function addTripMember(
  supabase: SupabaseClient,
  tripId: string,
  userId: string,
  role: "planner" | "viewer"
): Promise<void> {
  const { error } = await supabase
    .from("trip_members")
    .insert({ trip_id: tripId, user_id: userId, role });
  if (error) throw error;
}

export async function updateMemberRole(
  supabase: SupabaseClient,
  memberId: string,
  role: "planner" | "viewer"
): Promise<void> {
  const { error } = await supabase
    .from("trip_members")
    .update({ role })
    .eq("id", memberId);
  if (error) throw error;
}

export async function removeMember(
  supabase: SupabaseClient,
  memberId: string
): Promise<void> {
  const { error } = await supabase
    .from("trip_members")
    .delete()
    .eq("id", memberId);
  if (error) throw error;
}
