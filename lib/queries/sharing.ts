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

/**
 * Computes the first 8 hex chars of sha256(token) — used by the audit log
 * to correlate access patterns to a specific link without storing the
 * token plaintext or its full hash. Matches the prefix length stored in
 * share_audit_log.token_hash_prefix.
 */
export async function computeTokenHashPrefix(
  tokenPlaintext: string
): Promise<string> {
  const bytes = new TextEncoder().encode(tokenPlaintext);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 8);
}

/**
 * Writes an entry to share_audit_log via the SECURITY DEFINER RPC.
 * Errors are swallowed and logged — audit logging must never break the
 * user-facing share page. Call with an anonymous Supabase client.
 */
export async function logShareAccess(
  supabase: SupabaseClient,
  args: {
    eventType: "view" | "not_found" | "rate_limited";
    tokenHashPrefix: string | null;
    ip: string | null;
    userAgent: string | null;
    requestPath: string | null;
    status: number;
  }
): Promise<void> {
  const { error } = await supabase.rpc("log_share_access", {
    _event_type: args.eventType,
    _token_hash_prefix: args.tokenHashPrefix,
    _ip: args.ip,
    _user_agent: args.userAgent,
    _request_path: args.requestPath,
    _status: args.status,
  });
  if (error) {
    console.error("[share-audit] log_share_access failed:", error.message);
  }
}
