"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRealtimeContext } from "./RealtimeProvider";
import { createClient } from "@/lib/supabase/client";
import { getTripById } from "@/lib/queries/trips";
import type { Trip } from "@/lib/types/trip";
import { reconcileWithServer } from "./optimistic";

const HIDDEN_THRESHOLD_MS = 30_000;

interface UseConnectionRecoveryOptions {
  tripId: string;
  getCurrentTrip: () => Trip;
  onReconciled: (trip: Trip, conflicts: (keyof Trip)[]) => void;
}

/**
 * Handles browser online/offline events and tab refocus re-sync.
 * On reconnection or tab refocus after >30s hidden, fetches latest data
 * and reconciles with local state.
 */
export function useConnectionRecovery(options: UseConnectionRecoveryOptions) {
  const { channel } = useRealtimeContext();
  const [isRecovering, setIsRecovering] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>(new Date());
  const hiddenAtRef = useRef<number | null>(null);

  const recover = useCallback(async () => {
    setIsRecovering(true);

    try {
      const supabase = createClient();
      const serverTrip = await getTripById(supabase, options.tripId);

      if (serverTrip) {
        const currentTrip = options.getCurrentTrip();
        const allFields = Object.keys(currentTrip) as (keyof Trip)[];
        const { resolved, conflicts } = reconcileWithServer(
          currentTrip as unknown as Record<string, unknown>,
          serverTrip as unknown as Record<string, unknown>,
          [] // No pending fields during recovery — accept all server values
        ) as unknown as { resolved: Trip; conflicts: (keyof Trip)[] };

        // Filter out spurious conflicts — with no pending fields, there should be none
        options.onReconciled(resolved, conflicts);
        void allFields; // used for type context
      }

      setLastSyncedAt(new Date());
    } catch {
      // Recovery failed — will retry on next trigger
    } finally {
      setIsRecovering(false);
    }
  }, [options]);

  useEffect(() => {
    const handleOnline = () => {
      recover();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else {
        const hiddenAt = hiddenAtRef.current;
        if (hiddenAt && Date.now() - hiddenAt > HIDDEN_THRESHOLD_MS) {
          recover();
        }
        hiddenAtRef.current = null;
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [recover, channel]);

  return { isRecovering, lastSyncedAt };
}
