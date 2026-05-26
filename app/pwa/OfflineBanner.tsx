"use client";

import { useIsOffline } from "./OfflineContext";

export function OfflineBanner() {
  const isOffline = useIsOffline();
  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[60] bg-camp-earth text-camp-night text-sm font-medium px-4 py-2 text-center"
    >
      You&apos;re offline — showing last synced data. Editing is paused.
    </div>
  );
}
