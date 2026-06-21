"use client";

import { useEffect, useState, type ReactNode } from "react";
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

/** How long the connection may stay degraded before we warn the user.
 *  Supabase routinely emits CHANNEL_ERROR / TIMED_OUT / CLOSED during normal
 *  operation — token refresh (setAuth runs on every reconnect), brief tab
 *  backgrounding, and transient socket drops — all of which the provider's
 *  backoff loop recovers from within a second or two. Warning only after the
 *  connection stays down past this window suppresses those false positives
 *  while still surfacing a genuine, sustained loss. */
const RECONNECT_GRACE_MS = 5000;

function ConnectivityBanner() {
  const { connectionStatus } = useRealtimeContext();
  // `graceElapsed` = the connection has stayed down past the grace window.
  // Set only from the timeout callback; reset in cleanup when we leave the
  // degraded period — so we never call setState synchronously in the effect.
  const [graceElapsed, setGraceElapsed] = useState(false);

  // Asymmetric debounce: hide the moment we reconnect (good news fast — derived
  // during render below), but only arm the warning once the connection has
  // stayed down for the full grace window (bad news slow). Keying the effect
  // off the `connected` boolean — not the raw status — is deliberate:
  // transitions among the degraded sub-states (connecting ↔ error ↔
  // disconnected) as the retry loop cycles must NOT restart the timer, or a
  // real outage would keep resetting it and never warn.
  const isConnected = connectionStatus === "connected";
  useEffect(() => {
    if (isConnected) return;
    const timer = setTimeout(() => setGraceElapsed(true), RECONNECT_GRACE_MS);
    return () => {
      clearTimeout(timer);
      setGraceElapsed(false);
    };
  }, [isConnected]);

  // Show only while genuinely degraded AND past the grace window.
  if (isConnected || !graceElapsed) return null;

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
