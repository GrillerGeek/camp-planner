"use client";

import { useEffect } from "react";

interface CachePrefetcherProps {
  tripId: string;
}

export function CachePrefetcher({ tripId }: CachePrefetcherProps) {
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) {
      return;
    }
    if (!navigator.onLine) return;

    const paths = [
      `/dashboard/trips/${tripId}/reservations`,
      `/dashboard/trips/${tripId}/packing`,
      `/dashboard/trips/${tripId}/meals`,
    ];

    const timer = window.setTimeout(() => {
      void Promise.allSettled(
        paths.map((p) =>
          fetch(p, {
            credentials: "same-origin",
          }).catch(() => undefined)
        )
      );
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [tripId]);

  return null;
}
