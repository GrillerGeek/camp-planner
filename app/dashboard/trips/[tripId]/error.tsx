"use client";

import { useEffect } from "react";
import { OfflineEmptyState } from "@/app/pwa/OfflineEmptyState";

export default function TripDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Trip detail error:", error);
  }, [error]);

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return <OfflineEmptyState pageName="trip" onRetry={reset} />;
  }

  return (
    <div className="text-center py-16">
      <div className="text-5xl mb-4">⚠️</div>
      <h2 className="text-xl font-semibold text-white mb-2">
        Something went wrong
      </h2>
      <p className="text-camp-earth mb-6">{error.message}</p>
      <button
        onClick={reset}
        className="inline-block bg-camp-forest hover:bg-camp-pine text-white font-medium py-2.5 px-5 rounded-lg transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
