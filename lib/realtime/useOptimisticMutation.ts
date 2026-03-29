"use client";

import { useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  applyOptimisticUpdate,
  reconcileWithServer,
  createPendingQueue,
  type PendingQueue,
} from "./optimistic";

interface UseOptimisticMutationOptions<T> {
  onConflict?: (conflicts: (keyof T)[]) => void;
  onOptimisticUpdate?: (optimistic: T) => void;
  onRollback?: (original: T) => void;
  getCurrentState?: () => T;
}

/**
 * Hook wrapping Supabase updates with optimistic UI behavior.
 * Immediately applies updates locally, sends to server, and reconciles on response.
 */
export function useOptimisticMutation<T extends Record<string, unknown>>(
  tableName: string,
  options: UseOptimisticMutationOptions<T> = {}
) {
  const [pending, setPending] = useState(false);
  const queueRef = useRef<PendingQueue<T>>(createPendingQueue<T>());

  const mutate = useCallback(
    async (rowId: string, updates: Partial<T>) => {
      const currentState = options.getCurrentState?.();

      // Enqueue the mutation
      const mutationId = queueRef.current.enqueue({
        table: tableName,
        rowId,
        fields: updates,
      });

      // Apply optimistic update locally
      if (currentState) {
        const optimistic = applyOptimisticUpdate(currentState, updates);
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

        // Confirm the mutation
        queueRef.current.confirm(mutationId);

        // Reconcile with server response if we have local state
        if (currentState && data) {
          const pendingFields = Object.keys(updates) as (keyof T)[];
          const { conflicts } = reconcileWithServer(
            currentState,
            data as T,
            pendingFields
          );

          if (conflicts.length > 0) {
            options.onConflict?.(conflicts);
          }
        }
      } catch {
        // Reject the mutation and rollback
        queueRef.current.reject(mutationId);
        if (currentState) {
          options.onRollback?.(currentState);
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
