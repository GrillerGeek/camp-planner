"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface PresenceUser {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  online_at: string;
}

export interface PresenceProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface RealtimeContextValue {
  channel: RealtimeChannel | null;
  connectionStatus: ConnectionStatus;
  presentUsers: PresenceUser[];
}

const RealtimeContext = createContext<RealtimeContextValue>({
  channel: null,
  connectionStatus: "connecting",
  presentUsers: [],
});

export function useRealtimeContext() {
  return useContext(RealtimeContext);
}

interface RealtimeProviderProps {
  tripId: string;
  profile: PresenceProfile | null;
  children: ReactNode;
}

/**
 * Manages a single presence channel per trip. Presence handlers and
 * channel.track() are owned by the provider — Supabase Realtime throws if
 * presence callbacks are added after the channel has joined, so they must be
 * registered before subscribe(). Feature-level postgres_changes subscriptions
 * (packing, grocery, tasks) run on their own per-list channels — see
 * useRealtimeSubscription and the ad-hoc pattern in PackingListClient.
 */
export function RealtimeProvider({
  tripId,
  profile,
  children,
}: RealtimeProviderProps) {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [presentUsers, setPresentUsers] = useState<PresenceUser[]>([]);

  // Keep the latest profile in a ref so the channel's track() call inside the
  // subscribe callback always uses the current values without re-subscribing.
  const profileRef = useRef(profile);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const cleanup = useCallback((ch: RealtimeChannel | null) => {
    if (!ch) return;
    const supabase = createClient();
    supabase.removeChannel(ch);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channelName = `presence:${tripId}`;
    let currentChannel: RealtimeChannel | null = null;
    let retryCount = 0;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const syncPresence = (ch: RealtimeChannel) => {
      const state = ch.presenceState<PresenceUser>();
      const users: PresenceUser[] = [];
      const seenIds = new Set<string>();
      for (const key of Object.keys(state)) {
        for (const presence of state[key]) {
          if (!seenIds.has(presence.user_id)) {
            seenIds.add(presence.user_id);
            users.push(presence);
          }
        }
      }
      setPresentUsers(users);
    };

    const connect = () => {
      if (cancelled) return;
      setConnectionStatus("connecting");

      const ch = supabase.channel(channelName);
      currentChannel = ch;

      // Presence callbacks MUST be attached before subscribe() — Supabase
      // throws "cannot add presence callbacks after joining a channel" if
      // they arrive after the channel has joined.
      ch.on("presence", { event: "sync" }, () => syncPresence(ch))
        .on("presence", { event: "join" }, () => syncPresence(ch))
        .on("presence", { event: "leave" }, () => syncPresence(ch));

      ch.subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          retryCount = 0;
          setConnectionStatus("connected");
          setChannel(ch);
          const p = profileRef.current;
          if (p) {
            ch.track({
              user_id: p.id,
              display_name: p.display_name ?? "Trip member",
              avatar_url: p.avatar_url,
              online_at: new Date().toISOString(),
            });
          }
        } else if (status === "CHANNEL_ERROR") {
          setConnectionStatus("error");
          scheduleRetry();
        } else if (status === "TIMED_OUT") {
          setConnectionStatus("disconnected");
          scheduleRetry();
        } else if (status === "CLOSED") {
          setConnectionStatus("disconnected");
          setChannel(null);
          setPresentUsers([]);
        }
      });
    };

    const scheduleRetry = () => {
      if (cancelled) return;
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
      retryCount += 1;
      retryTimeout = setTimeout(() => {
        if (currentChannel) {
          cleanup(currentChannel);
          currentChannel = null;
        }
        connect();
      }, delay);
    };

    connect();

    // Tear down the channel on sign-out so a logged-out user does not keep
    // receiving presence broadcasts. The session-refresh middleware already
    // redirects to /login, but the channel can outlive the redirect.
    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setChannel(null);
        setConnectionStatus("disconnected");
        setPresentUsers([]);
        if (currentChannel) {
          cleanup(currentChannel);
          currentChannel = null;
        }
      }
    });

    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      authSub.subscription.unsubscribe();
      if (currentChannel) {
        cleanup(currentChannel);
        currentChannel = null;
      }
      setChannel(null);
      setPresentUsers([]);
    };
  }, [tripId, cleanup]);

  // Re-track when the profile identity changes (e.g. user updates display
  // name) so other connected users see fresh info without forcing a reconnect.
  useEffect(() => {
    if (!channel || connectionStatus !== "connected" || !profile) return;
    channel.track({
      user_id: profile.id,
      display_name: profile.display_name ?? "Trip member",
      avatar_url: profile.avatar_url,
      online_at: new Date().toISOString(),
    });
  }, [
    channel,
    connectionStatus,
    profile,
  ]);

  return (
    <RealtimeContext.Provider
      value={{ channel, connectionStatus, presentUsers }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}
