"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Trip } from "@/lib/types/trip";
import { useRealtimeSubscription } from "./useRealtimeSubscription";

/**
 * Subscribes to real-time changes on a single trip row.
 * Takes initialData from server fetch and keeps it in sync via realtime events.
 */
export function useRealtimeTrip(tripId: string, initialData: Trip) {
  const [trip, setTrip] = useState<Trip>(initialData);
  const [isStale, setIsStale] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const router = useRouter();

  const handleUpdate = useCallback(
    (_oldRow: Record<string, unknown>, newRow: Record<string, unknown>) => {
      setTrip(newRow as unknown as Trip);
      setIsStale(false);
    },
    []
  );

  const handleDelete = useCallback(() => {
    setDeleted(true);
    router.push("/dashboard");
  }, [router]);

  useRealtimeSubscription<Record<string, unknown>>(
    "trips",
    `id=eq.${tripId}`,
    {
      onUpdate: handleUpdate,
      onDelete: handleDelete,
    }
  );

  const updateTrip = useCallback((updates: Partial<Trip>) => {
    setTrip((prev) => ({ ...prev, ...updates }));
  }, []);

  const markStale = useCallback(() => {
    setIsStale(true);
  }, []);

  const refreshTrip = useCallback(
    (freshData: Trip) => {
      if (!deleted) {
        setTrip(freshData);
        setIsStale(false);
      }
    },
    [deleted]
  );

  return { trip, isStale, deleted, updateTrip, markStale, refreshTrip };
}
