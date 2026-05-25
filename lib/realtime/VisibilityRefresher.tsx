"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * SPEC-003b.2 — closes the tab-refocus drift gap for Server-Component
 * data not covered by per-feature realtime channels (e.g. the trip row,
 * member roster). When the tab regains visibility after being hidden
 * for ≥ STALE_THRESHOLD_MS, calls router.refresh() — re-runs the server
 * fetch tree without losing client state.
 *
 * Why a threshold rather than refresh on every visibility flip:
 *   - Short hides (alt-tab to look at a notification) don't risk
 *     meaningful drift and we don't want to spam fetches.
 *   - Per-feature channels (presence, packing, grocery, tasks) re-sync
 *     on their own reconnect when the tab wakes; only data without a
 *     channel needs explicit refresh.
 *
 * Threshold tuned to be longer than the typical app-switch but short
 * enough that a "I left this open over lunch" return refreshes.
 */
const STALE_THRESHOLD_MS = 30_000;

export function VisibilityRefresher() {
  const router = useRouter();
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      // visible
      const hidAt = hiddenAt.current;
      hiddenAt.current = null;
      if (hidAt === null) return;
      if (Date.now() - hidAt >= STALE_THRESHOLD_MS) {
        router.refresh();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [router]);

  return null;
}
