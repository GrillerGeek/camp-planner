"use server";

import { createClient } from "@/lib/supabase/server";
import { getTripById } from "@/lib/queries/trips";
import {
  generateMealSuggestions,
  type MealSuggestion,
} from "@/lib/ai/meal-suggestions";
import type { MealType } from "@/lib/types/meals";

interface SuggestMealsSuccess {
  ok: true;
  suggestions: MealSuggestion[];
}

interface SuggestMealsError {
  ok: false;
  error: string;
}

export async function suggestMealsForTrip(
  tripId: string
): Promise<SuggestMealsSuccess | SuggestMealsError> {
  const supabase = await createClient();

  const trip = await getTripById(supabase, tripId);
  if (!trip) {
    return { ok: false, error: "Trip not found or you don't have access." };
  }

  const [{ data: recipes }, { data: mealPlan }] = await Promise.all([
    supabase.from("recipes").select("id, name, tags"),
    supabase
      .from("trip_meal_plans")
      .select("id, trip_meals(meal_type)")
      .eq("trip_id", tripId)
      .maybeSingle(),
  ]);

  const existingMealTypes: MealType[] =
    (mealPlan?.trip_meals as { meal_type: MealType }[] | undefined)?.map(
      (m) => m.meal_type
    ) ?? [];

  try {
    const suggestions = await generateMealSuggestions({
      trip,
      recipes: recipes ?? [],
      existingMealTypes,
    });
    return { ok: true, suggestions };
  } catch (err) {
    console.error("[meal-suggestions]", err);
    return {
      ok: false,
      error:
        err instanceof Error
          ? `AI gateway error: ${err.message}`
          : "Failed to generate suggestions. Please try again.",
    };
  }
}
