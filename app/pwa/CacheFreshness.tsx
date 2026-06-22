"use client";

import { useIsOffline } from "./OfflineContext";

export function CacheFreshness() {
  const isOffline = useIsOffline();
  if (!isOffline) return null;

  return (
    <div className="text-xs text-camp-earth/80 italic mb-2">
      Showing cached data — connect to refresh.
    </div>
  );
}
