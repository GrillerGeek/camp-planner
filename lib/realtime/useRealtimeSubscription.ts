"use client";

import { useEffect, useState } from "react";
import { useRealtimeContext } from "./RealtimeProvider";
import { REALTIME_POSTGRES_CHANGES_LISTEN_EVENT } from "@supabase/supabase-js";

type SubscriptionStatus = "subscribed" | "pending" | "error";

interface SubscriptionCallbacks<T> {
  onInsert?: (row: T) => void;
  onUpdate?: (oldRow: T, newRow: T) => void;
  onDelete?: (oldRow: T) => void;
}

/**
 * Generic hook for subscribing to Postgres changes on a specific table.
 * Uses the channel from RealtimeProvider context.
 */
export function useRealtimeSubscription<T extends Record<string, unknown>>(
  tableName: string,
  filter: string,
  callbacks: SubscriptionCallbacks<T>
) {
  const { channel } = useRealtimeContext();
  const [status, setStatus] = useState<SubscriptionStatus>("pending");

  useEffect(() => {
    if (!channel) {
      setStatus("pending");
      return;
    }

    try {
      channel
        .on(
          "postgres_changes" as unknown as "system",
          {
            event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.INSERT,
            schema: "public",
            table: tableName,
            filter,
          } as unknown as { event: "system" },
          (payload: unknown) => {
            const p = payload as { new: T };
            callbacks.onInsert?.(p.new);
          }
        )
        .on(
          "postgres_changes" as unknown as "system",
          {
            event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.UPDATE,
            schema: "public",
            table: tableName,
            filter,
          } as unknown as { event: "system" },
          (payload: unknown) => {
            const p = payload as { old: T; new: T };
            callbacks.onUpdate?.(p.old, p.new);
          }
        )
        .on(
          "postgres_changes" as unknown as "system",
          {
            event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.DELETE,
            schema: "public",
            table: tableName,
            filter,
          } as unknown as { event: "system" },
          (payload: unknown) => {
            const p = payload as { old: T };
            callbacks.onDelete?.(p.old);
          }
        );

      setStatus("subscribed");
    } catch {
      setStatus("error");
    }

    // Cleanup is handled by RealtimeProvider removing the channel
  }, [channel, tableName, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  return { status };
}
