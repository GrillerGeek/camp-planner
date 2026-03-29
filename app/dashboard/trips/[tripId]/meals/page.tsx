import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTripById, getUserRoleForTrip } from "@/lib/queries/trips";
import { getTripMealPlan } from "@/lib/queries/meals";
import { getRecipes } from "@/lib/queries/meals";
import { MealPlannerClient } from "./components/MealPlannerClient";

export default async function TripMealsPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const supabase = await createClient();

  const [trip, role, mealPlan, recipes] = await Promise.all([
    getTripById(supabase, tripId),
    getUserRoleForTrip(supabase, tripId),
    getTripMealPlan(supabase, tripId),
    getRecipes(supabase),
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

  const isPlanner = role === "planner";

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/dashboard/trips/${tripId}`}
          className="text-camp-earth hover:text-white text-sm transition-colors flex items-center gap-1"
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
              d="M15.75 19.5 8.25 12l7.5-7.5"
            />
          </svg>
          Back to {trip.name}
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Meal Plan</h1>
          <p className="text-camp-earth text-sm">
            {trip.name} &middot; {trip.start_date} to {trip.end_date}
          </p>
        </div>
      </div>

      <MealPlannerClient
        tripId={tripId}
        trip={trip}
        isPlanner={isPlanner}
        initialMealPlan={mealPlan}
        recipes={recipes}
      />
    </div>
  );
}
