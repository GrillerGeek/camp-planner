import { createClient } from "@/lib/supabase/server";
import {
  getTripById,
  getUserRoleForTrip,
  getTripMembersDetailed,
} from "@/lib/queries/trips";
import Link from "next/link";
import { MembersClient } from "./components/MembersClient";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const supabase = await createClient();

  const [trip, role, members] = await Promise.all([
    getTripById(supabase, tripId),
    getUserRoleForTrip(supabase, tripId),
    getTripMembersDetailed(supabase, tripId),
  ]);

  if (!trip || !role) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">🔍</div>
        <h2 className="text-xl font-semibold text-white mb-2">
          Trip not found
        </h2>
        <Link
          href="/dashboard"
          className="inline-block bg-camp-forest hover:bg-camp-pine text-white font-medium py-2.5 px-5 rounded-lg transition-colors mt-4"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href={`/dashboard/trips/${tripId}`}
        className="text-camp-earth hover:text-white text-sm mb-2 inline-flex items-center gap-1 transition-colors"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 19.5L8.25 12l7.5-7.5"
          />
        </svg>
        Back to {trip.name}
      </Link>
      <h1 className="text-2xl font-bold text-white mt-1 mb-1">Members</h1>
      <p className="text-camp-earth text-sm mb-6">
        Who can see and edit this trip.
      </p>
      <MembersClient
        tripId={tripId}
        isPlanner={role === "planner"}
        initialMembers={members}
      />
    </div>
  );
}
