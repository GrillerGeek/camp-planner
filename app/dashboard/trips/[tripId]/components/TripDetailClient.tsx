"use client";

import { useCallback } from "react";
import type { Trip } from "@/lib/types/trip";
import { useRealtimeTrip } from "@/lib/realtime/useRealtimeTrip";
import { useConnectionRecovery } from "@/lib/realtime/useConnectionRecovery";
import { TripHeader } from "./TripHeader";
import { ReadinessCard } from "./ReadinessCard";
import { PresenceAvatars } from "./PresenceAvatars";

interface TripDetailClientProps {
  initialTrip: Trip;
  userRole: "planner" | "viewer";
  currentUser: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

/**
 * Client wrapper that receives server-fetched trip data and subscribes
 * to real-time updates. Shows presence, connectivity status, and handles
 * tab refocus re-sync.
 */
export function TripDetailClient({
  initialTrip,
  userRole,
  currentUser,
}: TripDetailClientProps) {
  const { trip, isStale, refreshTrip } = useRealtimeTrip(
    initialTrip.id,
    initialTrip
  );

  const getCurrentTrip = useCallback(() => trip, [trip]);

  const handleReconciled = useCallback(
    (reconciledTrip: Trip) => {
      refreshTrip(reconciledTrip);
    },
    [refreshTrip]
  );

  const { isRecovering } = useConnectionRecovery({
    tripId: initialTrip.id,
    getCurrentTrip,
    onReconciled: handleReconciled,
  });

  return (
    <div>
      {(isStale || isRecovering) && (
        <div className="text-camp-earth text-sm text-center py-1 mb-2 animate-pulse">
          Syncing...
        </div>
      )}

      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex-1">
          <TripHeader trip={trip} userRole={userRole} />
        </div>
        <div className="shrink-0 pt-1">
          <PresenceAvatars
            userId={currentUser.id}
            displayName={currentUser.displayName}
            avatarUrl={currentUser.avatarUrl}
          />
        </div>
      </div>

      {trip.notes && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
          <p className="text-camp-earth text-sm">{trip.notes}</p>
        </div>
      )}

      <h2 className="text-lg font-semibold text-white mb-4">Trip Readiness</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ReadinessCard
          title="Packing"
          icon="🎒"
          status="empty"
          percentage={0}
          emptyMessage="No packing list yet — add items to get started"
        />
        <ReadinessCard
          title="Meals"
          icon="🍳"
          status="empty"
          percentage={0}
          emptyMessage="No meals planned yet"
        />
        <ReadinessCard
          title="Tasks"
          icon="✅"
          status="empty"
          percentage={0}
          emptyMessage="No tasks assigned yet"
        />
        <ReadinessCard
          title="Reservations"
          icon="📋"
          status="empty"
          percentage={0}
          emptyMessage="No reservations added yet"
        />
      </div>
    </div>
  );
}
