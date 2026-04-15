"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

interface RealtimeContextValue {
  channel: RealtimeChannel | null;
  connectionStatus: ConnectionStatus;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  channel: null,
  connectionStatus: "connecting",
});

export function useRealtimeContext() {
  return useContext(RealtimeContext);
}

interface RealtimeProviderProps {
  tripId: string;
  children: ReactNode;
}

/**
 * Manages a single presence channel per trip. Feature-level postgres_changes
 * subscriptions (packing, grocery, tasks) run on their own per-list channels —
 * see useRealtimeSubscription and the ad-hoc pattern in PackingListClient.
 *
 * The channel is stored in state (not a ref) so consumers re-render when it
 * becomes available, and we only expose the channel after subscribe() returns
 * SUBSCRIBED — preventing consumers from attaching late .on() handlers that
 * would be silently dropped.
 */
export function RealtimeProvider({ tripId, children }: RealtimeProviderProps) {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");

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

    const connect = () => {
      if (cancelled) return;
      setConnectionStatus("connecting");

      const ch = supabase.channel(channelName);
      currentChannel = ch;

      ch.subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          retryCount = 0;
          setConnectionStatus("connected");
          setChannel(ch);
        } else if (status === "CHANNEL_ERROR") {
          setConnectionStatus("error");
          scheduleRetry();
        } else if (status === "TIMED_OUT") {
          setConnectionStatus("disconnected");
          scheduleRetry();
        } else if (status === "CLOSED") {
          setConnectionStatus("disconnected");
          setChannel(null);
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
    };
  }, [tripId, cleanup]);

  return (
    <RealtimeContext.Provider value={{ channel, connectionStatus }}>
      {children}
    </RealtimeContext.Provider>
  );
}
