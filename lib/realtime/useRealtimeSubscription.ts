"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { REALTIME_POSTGRES_CHANGES_LISTEN_EVENT } from "@supabase/supabase-js";
import type { RealtimeChannel } from "@supabase/supabase-js";

type SubscriptionStatus = "subscribed" | "pending" | "error";

interface SubscriptionCallbacks<T> {
  onInsert?: (row: T) => void;
  onUpdate?: (oldRow: T, newRow: T) => void;
  onDelete?: (oldRow: T) => void;
}

/**
 * Subscribes to Postgres changes on a specific table with its own Supabase
 * channel. Handlers are registered before subscribe() to avoid the Supabase
 * quirk where late .on() calls are silently dropped. The channel is torn down
 * on unmount or when the filter changes.
 *
 * Keep the callbacks stable via useCallback or refs if the parent component
 * re-renders frequently — each filter change spins up a fresh channel.
 */
export function useRealtimeSubscription<T extends Record<string, unknown>>(
  tableName: string,
  filter: string,
  callbacks: SubscriptionCallbacks<T>
) {
  const [status, setStatus] = useState<SubscriptionStatus>("pending");

  // Keep callbacks in a ref so we can use the latest handlers without
  // re-subscribing on every parent render.
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    const supabase = createClient();
    const channelName = `${tableName}-${filter}-${crypto.randomUUID()}`;
    let channel: RealtimeChannel | null = supabase.channel(channelName);

    const changeHandler = <E extends "INSERT" | "UPDATE" | "DELETE">(
      event: E,
      handler: (payload: unknown) => void
    ) => {
      channel = channel!.on(
        "postgres_changes" as unknown as "system",
        {
          event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT[event],
          schema: "public",
          table: tableName,
          filter,
        } as unknown as { event: "system" },
        handler
      );
    };

    changeHandler("INSERT", (payload) => {
      const p = payload as { new: T };
      callbacksRef.current.onInsert?.(p.new);
    });
    changeHandler("UPDATE", (payload) => {
      const p = payload as { old: T; new: T };
      callbacksRef.current.onUpdate?.(p.old, p.new);
    });
    changeHandler("DELETE", (payload) => {
      const p = payload as { old: T };
      callbacksRef.current.onDelete?.(p.old);
    });

    channel.subscribe((subscribeStatus) => {
      if (subscribeStatus === "SUBSCRIBED") {
        setStatus("subscribed");
      } else if (
        subscribeStatus === "CHANNEL_ERROR" ||
        subscribeStatus === "TIMED_OUT"
      ) {
        setStatus("error");
      }
    });

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
      setStatus("pending");
    };
  }, [tableName, filter]);

  return { status };
}
