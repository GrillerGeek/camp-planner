/**
 * Optimistic update utilities for real-time collaboration.
 * Uses last-write-wins at the field level for conflict resolution.
 */

export interface PendingMutation<T> {
  id: string;
  timestamp: number;
  table: string;
  rowId: string;
  fields: Partial<T>;
  status: "pending" | "confirmed" | "rejected";
}

export interface PendingQueue<T> {
  enqueue(mutation: Omit<PendingMutation<T>, "id" | "timestamp" | "status">): string;
  confirm(mutationId: string): void;
  reject(mutationId: string): void;
  getAll(): PendingMutation<T>[];
  getPending(): PendingMutation<T>[];
  clear(): void;
}

/**
 * Merges a partial update into the current state, returning the optimistic version.
 */
export function applyOptimisticUpdate<T extends Record<string, unknown>>(
  currentState: T,
  pendingUpdate: Partial<T>
): T {
  return { ...currentState, ...pendingUpdate };
}

/**
 * Compares the server state to the optimistic state for conflict resolution.
 * - For fields NOT in pendingFields, accept server values.
 * - For fields in pendingFields where server value differs from pre-edit, flag as conflicts.
 */
export function reconcileWithServer<T extends Record<string, unknown>>(
  optimisticState: T,
  serverState: T,
  pendingFields: (keyof T)[]
): { resolved: T; conflicts: (keyof T)[] } {
  const resolved = { ...serverState } as T;
  const conflicts: (keyof T)[] = [];

  for (const field of pendingFields) {
    if (
      field in serverState &&
      field in optimisticState &&
      serverState[field] !== optimisticState[field]
    ) {
      conflicts.push(field);
    }
    // Keep the optimistic (local) value for pending fields
    if (field in optimisticState) {
      (resolved as Record<string, unknown>)[field as string] =
        optimisticState[field];
    }
  }

  return { resolved, conflicts };
}

/**
 * Creates a FIFO queue of pending mutations that have not yet been confirmed by the server.
 */
export function createPendingQueue<T>(): PendingQueue<T> {
  let queue: PendingMutation<T>[] = [];

  return {
    enqueue(mutation) {
      const id = crypto.randomUUID();
      const entry: PendingMutation<T> = {
        ...mutation,
        id,
        timestamp: Date.now(),
        status: "pending",
      };
      queue.push(entry);
      return id;
    },

    confirm(mutationId: string) {
      queue = queue.map((m) =>
        m.id === mutationId ? { ...m, status: "confirmed" as const } : m
      );
      // Remove confirmed mutations from the front of the queue
      while (queue.length > 0 && queue[0].status === "confirmed") {
        queue.shift();
      }
    },

    reject(mutationId: string) {
      queue = queue.map((m) =>
        m.id === mutationId ? { ...m, status: "rejected" as const } : m
      );
    },

    getAll() {
      return [...queue];
    },

    getPending() {
      return queue.filter((m) => m.status === "pending");
    },

    clear() {
      queue = [];
    },
  };
}
