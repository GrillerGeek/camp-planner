"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
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

export function RealtimeProvider({ tripId, children }: RealtimeProviderProps) {
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  const cleanup = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (channelRef.current) {
      const supabase = createClient();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channelName = `trip:${tripId}`;

    const subscribe = () => {
      cleanup();
      setConnectionStatus("connecting");

      const channel = supabase.channel(channelName);
      channelRef.current = channel;

      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnectionStatus("connected");
          retryCountRef.current = 0;
        } else if (status === "CHANNEL_ERROR") {
          setConnectionStatus("error");
          scheduleRetry();
        } else if (status === "TIMED_OUT") {
          setConnectionStatus("disconnected");
          scheduleRetry();
        } else if (status === "CLOSED") {
          setConnectionStatus("disconnected");
        }
      });
    };

    const scheduleRetry = () => {
      const delay = Math.min(
        1000 * Math.pow(2, retryCountRef.current),
        30000
      );
      retryCountRef.current += 1;
      retryTimeoutRef.current = setTimeout(() => {
        subscribe();
      }, delay);
    };

    subscribe();

    return cleanup;
  }, [tripId, cleanup]);

  return (
    <RealtimeContext.Provider
      value={{
        channel: channelRef.current,
        connectionStatus,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}
