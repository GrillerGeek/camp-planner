"use client";

import { useRealtimeContext } from "./RealtimeProvider";

export type { PresenceUser } from "./RealtimeProvider";

/**
 * Thin reader over the presence state managed inside RealtimeProvider.
 * Presence handlers and channel.track() live in the provider because Supabase
 * Realtime forbids attaching presence callbacks after the channel has joined.
 */
export function usePresence() {
  const { presentUsers } = useRealtimeContext();
  return { presentUsers };
}
