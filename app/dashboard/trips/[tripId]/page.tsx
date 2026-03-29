import { createClient } from "@/lib/supabase/server";
import { getTripById, getUserRoleForTrip } from "@/lib/queries/trips";
import { getPackingProgress } from "@/lib/queries/packing";
import { getMealProgress } from "@/lib/queries/meals";
import { getTaskProgress } from "@/lib/queries/tasks";
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

  const [trip, role, packingProgress, mealProgress, taskProgress] = await Promise.all([
    getTripById(supabase, tripId),
    getUserRoleForTrip(supabase, tripId),
    getPackingProgress(supabase, tripId),
    getMealProgress(supabase, tripId),
    getTaskProgress(supabase, tripId),
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
          status={
            !packingProgress || packingProgress.total === 0
              ? "empty"
              : packingProgress.packed === packingProgress.total
              ? "complete"
              : "in_progress"
          }
          percentage={
            packingProgress && packingProgress.total > 0
              ? Math.round(
                  (packingProgress.packed / packingProgress.total) * 100
                )
              : 0
          }
          detail={
            packingProgress && packingProgress.total > 0
              ? `${packingProgress.packed}/${packingProgress.total} items packed`
              : undefined
          }
          emptyMessage="No packing list yet — tap to get started"
          href={`/dashboard/trips/${tripId}/packing`}
        />
        <ReadinessCard
          title="Meals"
          icon="🍳"
          status={
            !mealProgress || mealProgress.planned === 0
              ? "empty"
              : mealProgress.planned >= mealProgress.total
              ? "complete"
              : "in_progress"
          }
          percentage={
            mealProgress && mealProgress.total > 0
              ? Math.round(
                  (mealProgress.planned / mealProgress.total) * 100
                )
              : 0
          }
          detail={
            mealProgress && mealProgress.planned > 0
              ? `${mealProgress.planned}/${mealProgress.total} meals planned`
              : undefined
          }
          emptyMessage="No meals planned yet — tap to get started"
          href={`/dashboard/trips/${tripId}/meals`}
        />
        <ReadinessCard
          title="Tasks"
          icon="✅"
          status={
            !taskProgress || taskProgress.total === 0
              ? "empty"
              : taskProgress.completed === taskProgress.total
              ? "complete"
              : "in_progress"
          }
          percentage={
            taskProgress && taskProgress.total > 0
              ? Math.round(
                  (taskProgress.completed / taskProgress.total) * 100
                )
              : 0
          }
          detail={
            taskProgress && taskProgress.total > 0
              ? `${taskProgress.completed}/${taskProgress.total} tasks completed`
              : undefined
          }
          emptyMessage="No tasks assigned yet — tap to get started"
          href={`/dashboard/trips/${tripId}/tasks`}
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
