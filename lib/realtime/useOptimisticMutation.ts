"use client";

import { useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  applyOptimisticUpdate,
  reconcileWithServer,
  createPendingQueue,
  type PendingQueue,
  type ConflictReport,
} from "./optimistic";

interface UseOptimisticMutationOptions<T extends Record<string, unknown>> {
  onConflict?: (conflicts: ConflictReport<T>[]) => void;
  onOptimisticUpdate?: (optimistic: T) => void;
  onRollback?: (original: T) => void;
  getCurrentState?: () => T;
}

/**
 * Wraps a Supabase row update with optimistic UI behavior. Applies the
 * update locally, sends it to the server, and reconciles the server's
 * response against what we attempted to write. If any field came back
 * different from what we sent, another writer beat us to it and onConflict
 * fires with the overwritten-value details.
 */
export function useOptimisticMutation<T extends Record<string, unknown>>(
  tableName: string,
  options: UseOptimisticMutationOptions<T> = {}
) {
  const [pending, setPending] = useState(false);
  const queueRef = useRef<PendingQueue<T>>(createPendingQueue<T>());

  const mutate = useCallback(
    async (rowId: string, updates: Partial<T>) => {
      const originalState = options.getCurrentState?.();

      const mutationId = queueRef.current.enqueue({
        table: tableName,
        rowId,
        fields: updates,
      });

      if (originalState) {
        const optimistic = applyOptimisticUpdate(originalState, updates);
        options.onOptimisticUpdate?.(optimistic);
      }

      setPending(true);

      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from(tableName)
          .update(updates as Record<string, unknown>)
          .eq("id", rowId)
          .select()
          .single();

        if (error) throw error;

        queueRef.current.confirm(mutationId);

        if (data) {
          const { conflicts } = reconcileWithServer<T>(
            updates,
            data as T
          );
          if (conflicts.length > 0) {
            options.onConflict?.(conflicts);
          }
        }
      } catch {
        queueRef.current.reject(mutationId);
        if (originalState) {
          options.onRollback?.(originalState);
        }
      } finally {
        const stillPending = queueRef.current.getPending().length > 0;
        setPending(stillPending);
      }
    },
    [tableName, options]
  );

  return { mutate, pending, queue: queueRef.current };
}
