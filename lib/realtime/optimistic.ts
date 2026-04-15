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
 * Detects last-write-wins conflicts after a mutation completes.
 *
 * Compare the server response (what's actually in the DB now) against what
 * we intended to write. If they differ, another writer beat us to it — the
 * server will reflect their value and ours was overwritten. For fields we
 * didn't touch, always accept the server value.
 */
export interface ConflictReport<T extends Record<string, unknown>> {
  field: keyof T;
  attemptedValue: unknown;
  serverValue: unknown;
}

export function reconcileWithServer<T extends Record<string, unknown>>(
  attemptedUpdates: Partial<T>,
  serverState: T
): { resolved: T; conflicts: ConflictReport<T>[] } {
  const resolved = { ...serverState } as T;
  const conflicts: ConflictReport<T>[] = [];

  for (const field of Object.keys(attemptedUpdates) as (keyof T)[]) {
    const attempted = attemptedUpdates[field];
    const actual = serverState[field];
    if (attempted !== undefined && actual !== attempted) {
      conflicts.push({
        field,
        attemptedValue: attempted,
        serverValue: actual,
      });
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
