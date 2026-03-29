"use client";

import { use, type ReactNode } from "react";
import {
  RealtimeProvider,
  useRealtimeContext,
} from "@/lib/realtime/RealtimeProvider";

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

export default function TripDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = use(params);

  return (
    <RealtimeProvider tripId={tripId}>
      <ConnectivityBanner />
      {children}
    </RealtimeProvider>
  );
}
