import { SupabaseClient } from "@supabase/supabase-js";
import { SharedTripData, TripShareLink } from "@/lib/types/sharing";

/**
 * Creates a new share link for a trip. The plaintext token is generated
 * and hashed server-side; only the plaintext is returned to the caller
 * (once). Persisted rows hold only the hash.
 */
export async function createShareLink(
  supabase: SupabaseClient,
  tripId: string
): Promise<{ plaintext: string }> {
  const { data, error } = await supabase.rpc("create_share_link", {
    _trip_id: tripId,
  });

  if (error) throw error;
  if (typeof data !== "string") {
    throw new Error("create_share_link returned an unexpected payload");
  }
  return { plaintext: data };
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

/**
 * Revokes a share link. Both the link id AND the owning trip id must be
 * supplied so that the server can verify the caller is a planner of that
 * specific trip (not just a planner of some unrelated trip).
 */
export async function revokeShareLink(
  supabase: SupabaseClient,
  linkId: string,
  tripId: string
): Promise<void> {
  const { error } = await supabase.rpc("revoke_share_link", {
    _link_id: linkId,
    _trip_id: tripId,
  });
  if (error) throw error;
}

/**
 * Fetches the full shared trip payload via the security-definer RPC.
 * This is the ONLY public entry point guests should use. The function
 * expects to be called with an anonymous Supabase client.
 */
export async function getSharedTripByToken(
  supabase: SupabaseClient,
  tokenPlaintext: string
): Promise<SharedTripData | null> {
  const { data, error } = await supabase.rpc("get_shared_trip", {
    _token_plaintext: tokenPlaintext,
  });

  if (error || !data) return null;
  return data as SharedTripData;
}
