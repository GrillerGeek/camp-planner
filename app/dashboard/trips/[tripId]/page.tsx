import { createClient } from "@/lib/supabase/server";
import { getTripById, getUserRoleForTrip } from "@/lib/queries/trips";
import Link from "next/link";
import { TripHeader } from "./components/TripHeader";
import { ReadinessCard } from "./components/ReadinessCard";

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const supabase = await createClient();

  const [trip, role] = await Promise.all([
    getTripById(supabase, tripId),
    getUserRoleForTrip(supabase, tripId),
  ]);

  if (!trip || !role) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">🔍</div>
        <h2 className="text-xl font-semibold text-white mb-2">
          Trip not found
        </h2>
        <p className="text-camp-earth mb-6">
          This trip doesn&apos;t exist or you don&apos;t have access.
        </p>
        <Link
          href="/dashboard"
          className="inline-block bg-camp-forest hover:bg-camp-pine text-white font-medium py-2.5 px-5 rounded-lg transition-colors"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div>
      <TripHeader trip={trip} userRole={role} />

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
