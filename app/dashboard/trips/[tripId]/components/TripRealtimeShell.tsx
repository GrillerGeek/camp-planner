"use client";

import type { ReactNode } from "react";
import {
  RealtimeProvider,
  useRealtimeContext,
  type PresenceProfile,
} from "@/lib/realtime/RealtimeProvider";
import { VisibilityRefresher } from "@/lib/realtime/VisibilityRefresher";
import { PresenceAvatars } from "./PresenceAvatars";

interface TripRealtimeShellProps {
  tripId: string;
  profile: PresenceProfile | null;
  children: ReactNode;
}

function ConnectivityBanner() {
  const { connectionStatus } = useRealtimeContext();

  if (connectionStatus === "connected" || connectionStatus === "connecting") {
    return null;
  }

  return (
    <div className="bg-amber-600/90 text-white text-sm text-center py-2 px-4 rounded-lg mb-4">
      Connection lost — changes may not sync. Reconnecting...
    </div>
  );
}

export function TripRealtimeShell({
  tripId,
  profile,
  children,
}: TripRealtimeShellProps) {
  return (
    <RealtimeProvider tripId={tripId} profile={profile}>
      <VisibilityRefresher />
      <ConnectivityBanner />
      {profile && (
        <div className="flex justify-end mb-3">
          <PresenceAvatars />
        </div>
      )}
      {children}
    </RealtimeProvider>
  );
}
