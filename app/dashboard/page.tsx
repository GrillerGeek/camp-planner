import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTripsForUser } from "@/lib/queries/trips";
import { TripCard } from "./components/TripCard";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] ?? "Camper";

  let trips: Awaited<ReturnType<typeof getTripsForUser>> = [];
  try {
    trips = await getTripsForUser(supabase);
  } catch {
    trips = [];
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">
            Welcome back, {firstName}!
          </h1>
          <p className="text-camp-earth">Your camping trip command center.</p>
        </div>
        <Link
          href="/dashboard/trips/new"
          className="bg-camp-forest hover:bg-camp-pine text-white text-sm font-medium py-2.5 px-5 rounded-lg transition-colors flex items-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          New Trip
        </Link>
      </div>

      {trips.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🏕️</div>
          <h2 className="text-xl font-semibold text-white mb-2">
            No trips planned yet
          </h2>
          <p className="text-camp-earth mb-6 max-w-sm mx-auto">
            Create your first camping trip to start planning packing lists,
            meals, and more.
          </p>
          <Link
            href="/dashboard/trips/new"
            className="inline-block bg-camp-forest hover:bg-camp-pine text-white font-medium py-3 px-6 rounded-lg transition-colors"
          >
            Plan your first trip
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {trips.map((trip, index) => (
            <TripCard key={trip.id} trip={trip} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}
