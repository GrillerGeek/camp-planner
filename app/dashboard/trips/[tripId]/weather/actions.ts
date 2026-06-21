"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getTripById,
  getUserRoleForTrip,
  updateTripLocation,
} from "@/lib/queries/trips";
import { getTripPackingList } from "@/lib/queries/packing";
import { getTripMealPlan } from "@/lib/queries/meals";
import { geocodePlace } from "@/lib/weather/geocode";
import { generateWeatherNudges } from "@/lib/ai/weather-nudges";
import type {
  DailyForecast,
  GeocodeResult,
  WeatherAssessment,
  WeatherNudge,
} from "@/lib/types/weather";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

/** Planner-gate helper. RLS does NOT cover the read-then-spend AI action,
 *  so we enforce the role explicitly (SPEC-010 review blocker 1). */
async function requirePlanner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string
): Promise<string | null> {
  const role = await getUserRoleForTrip(supabase, tripId);
  return role === "planner" ? null : "Only planners can do that.";
}

export async function geocodeDestination(
  tripId: string
): Promise<Result<{ candidates: GeocodeResult[] }>> {
  const supabase = await createClient();
  const denied = await requirePlanner(supabase, tripId);
  if (denied) return { ok: false, error: denied };

  const trip = await getTripById(supabase, tripId);
  if (!trip) return { ok: false, error: "Trip not found or no access." };

  const outcome = await geocodePlace(trip.destination);
  if (outcome.status === "unavailable") {
    return {
      ok: false,
      error: "Weather location lookup is temporarily unavailable. Please try again in a moment.",
    };
  }
  if (outcome.status === "not_found") {
    return { ok: false, error: "Couldn't find that place — try refining the destination." };
  }
  return { ok: true, candidates: outcome.results };
}

export async function saveTripLocation(
  tripId: string,
  choice: { latitude: number; longitude: number; label: string }
): Promise<Result<Record<never, never>>> {
  const supabase = await createClient();
  // The trips UPDATE RLS policy is the real boundary; this is defense-in-depth.
  const denied = await requirePlanner(supabase, tripId);
  if (denied) return { ok: false, error: denied };

  // Concrete payload validation — client coords are a trust boundary.
  const { latitude, longitude, label } = choice;
  const validCoords =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;
  const trimmedLabel = (label ?? "").trim();
  if (!validCoords || trimmedLabel.length === 0 || trimmedLabel.length > 200) {
    return { ok: false, error: "Invalid location." };
  }

  try {
    await updateTripLocation(supabase, tripId, {
      latitude,
      longitude,
      label: trimmedLabel,
    });
    revalidatePath(`/dashboard/trips/${tripId}`);
    revalidateTag(`trip-forecast:${tripId}`, "max"); // drop any stale cached forecast
    return { ok: true };
  } catch (err) {
    console.error("[weather:saveTripLocation]", err);
    return { ok: false, error: "Failed to save location. Please try again." };
  }
}

export async function checkWeatherReadiness(
  tripId: string,
  forecast: DailyForecast[]
): Promise<Result<{ assessment: WeatherAssessment; nudges: WeatherNudge[] }>> {
  const supabase = await createClient();
  // HARD planner gate FIRST — this is the authorization boundary for AI spend.
  const denied = await requirePlanner(supabase, tripId);
  if (denied) return { ok: false, error: denied };

  const trip = await getTripById(supabase, tripId);
  if (!trip) return { ok: false, error: "Trip not found or no access." };
  if (!forecast || forecast.length === 0) {
    return { ok: false, error: "No forecast available to check against." };
  }

  const [packingList, mealPlan] = await Promise.all([
    getTripPackingList(supabase, tripId),
    getTripMealPlan(supabase, tripId),
  ]);

  const packingItems =
    packingList?.trip_packing_items.map((i) => ({
      name: i.name,
      category: i.category,
      is_essential: i.is_essential,
    })) ?? [];

  const meals =
    mealPlan?.trip_meals.map((m) => ({
      day_date: m.day_date,
      meal_type: m.meal_type,
      name: m.custom_meal_name ?? m.recipes?.name ?? "meal",
    })) ?? [];

  try {
    const { assessment, nudges } = await generateWeatherNudges({
      trip,
      forecast,
      packingItems,
      meals,
    });
    return { ok: true, assessment, nudges };
  } catch (err) {
    console.error("[weather:checkWeatherReadiness]", err);
    return {
      ok: false,
      error:
        err instanceof Error
          ? `AI gateway error: ${err.message}`
          : "Failed to check readiness. Please try again.",
    };
  }
}
