"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtimeContext } from "./RealtimeProvider";

export interface PresenceUser {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  online_at: string;
}

interface PresenceState {
  [key: string]: PresenceUser[];
}

interface UsePresenceOptions {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * Presence tracking hook for showing who is currently viewing a trip.
 * Throttles presence updates to at most once every 2 seconds.
 */
export function usePresence(options: UsePresenceOptions) {
  const { channel } = useRealtimeContext();
  const [presentUsers, setPresentUsers] = useState<PresenceUser[]>([]);
  const lastTrackRef = useRef(0);
  const trackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncPresenceState = useCallback(() => {
    if (!channel) return;

    const state = channel.presenceState<PresenceUser>() as PresenceState;
    const users: PresenceUser[] = [];
    const seenIds = new Set<string>();

    for (const key of Object.keys(state)) {
      const presences = state[key];
      for (const presence of presences) {
        if (!seenIds.has(presence.user_id)) {
          seenIds.add(presence.user_id);
          users.push(presence);
        }
      }
    }

    setPresentUsers(users);
  }, [channel]);

  const trackNow = useCallback(() => {
    if (!channel) return;
    lastTrackRef.current = Date.now();
    channel.track({
      user_id: options.userId,
      display_name: options.displayName,
      avatar_url: options.avatarUrl,
      online_at: new Date().toISOString(),
    });
  }, [channel, options.userId, options.displayName, options.avatarUrl]);

  // Keep latest trackNow in a ref so the trailing-edge timeout always uses
  // the latest options instead of a stale closure.
  const trackNowRef = useRef(trackNow);
  useEffect(() => {
    trackNowRef.current = trackNow;
  }, [trackNow]);

  const throttledTrack = useCallback(() => {
    const elapsed = Date.now() - lastTrackRef.current;
    if (elapsed >= 2000) {
      trackNowRef.current();
    } else if (!trackTimeoutRef.current) {
      trackTimeoutRef.current = setTimeout(() => {
        trackTimeoutRef.current = null;
        trackNowRef.current();
      }, 2000 - elapsed);
    }
  }, []);

  useEffect(() => {
    if (!channel) return;

    channel
      .on("presence", { event: "sync" }, () => {
        syncPresenceState();
      })
      .on("presence", { event: "join" }, () => {
        syncPresenceState();
      })
      .on("presence", { event: "leave" }, () => {
        syncPresenceState();
      });

    throttledTrack();

    return () => {
      if (trackTimeoutRef.current) {
        clearTimeout(trackTimeoutRef.current);
        trackTimeoutRef.current = null;
      }
      channel.untrack();
    };
  }, [channel, syncPresenceState, throttledTrack]);

  return { presentUsers };
}
