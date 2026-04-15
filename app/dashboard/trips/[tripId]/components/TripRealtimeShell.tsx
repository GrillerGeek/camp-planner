"use client";

import type { ReactNode } from "react";
import {
  RealtimeProvider,
  useRealtimeContext,
} from "@/lib/realtime/RealtimeProvider";
import { PresenceAvatars } from "./PresenceAvatars";

interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface TripRealtimeShellProps {
  tripId: string;
  profile: Profile | null;
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
    <RealtimeProvider tripId={tripId}>
      <ConnectivityBanner />
      {profile && (
        <div className="flex justify-end mb-3">
          <PresenceAvatars
            userId={profile.id}
            displayName={profile.display_name ?? "Trip member"}
            avatarUrl={profile.avatar_url}
          />
        </div>
      )}
      {children}
    </RealtimeProvider>
  );
}
