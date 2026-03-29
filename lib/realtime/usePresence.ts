"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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
  const [isTracking, setIsTracking] = useState(false);
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

  const throttledTrack = useCallback(() => {
    if (!channel) return;

    const now = Date.now();
    const elapsed = now - lastTrackRef.current;

    if (elapsed >= 2000) {
      lastTrackRef.current = now;
      channel.track({
        user_id: options.userId,
        display_name: options.displayName,
        avatar_url: options.avatarUrl,
        online_at: new Date().toISOString(),
      });
    } else if (!trackTimeoutRef.current) {
      trackTimeoutRef.current = setTimeout(() => {
        trackTimeoutRef.current = null;
        throttledTrack();
      }, 2000 - elapsed);
    }
  }, [channel, options.userId, options.displayName, options.avatarUrl]);

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

    // Track the current user
    throttledTrack();
    setIsTracking(true);

    return () => {
      if (trackTimeoutRef.current) {
        clearTimeout(trackTimeoutRef.current);
        trackTimeoutRef.current = null;
      }
      channel.untrack();
      setIsTracking(false);
    };
  }, [channel, syncPresenceState, throttledTrack]);

  return { presentUsers, isTracking };
}
