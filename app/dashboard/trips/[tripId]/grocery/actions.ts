"use server";

import { createClient } from "@/lib/supabase/server";
import { getTripById, getUserRoleForTrip } from "@/lib/queries/trips";
import { computeRecipeProposals } from "@/lib/queries/grocery";
import { generateGroceryFromMeals } from "@/lib/ai/grocery-from-meals";

export interface ProposedGroceryItem {
  name: string;
  quantity: number;
  unit: string | null;
  category: string;
  /** Where the suggestion came from — drives a small provenance badge. */
  source: "recipe" | "ai";
}

interface ProposeSuccess {
  ok: true;
  items: ProposedGroceryItem[];
}

interface ProposeError {
  ok: false;
  error: string;
}

/** Days the trip covers, inclusive of both end dates (min 1). */
function tripDays(startDate: string, endDate: string): number {
  const start = new Date(startDate + "T00:00:00").getTime();
  const end = new Date(endDate + "T00:00:00").getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 1;
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Build a reviewable grocery proposal from a trip's meals:
 * - recipe-linked meals → exact ingredient aggregation (computeRecipeProposals)
 * - custom (name-only) meals → AI inference scaled to headcount × days
 * Returns the combined set WITHOUT writing — the modal commits after review.
 */
export async function proposeGroceryFromMeals(
  tripId: string,
  headcount: number
): Promise<ProposeSuccess | ProposeError> {
  const supabase = await createClient();

  const [trip, role] = await Promise.all([
    getTripById(supabase, tripId),
    getUserRoleForTrip(supabase, tripId),
  ]);

  if (!trip) {
    return { ok: false, error: "Trip not found or you don't have access." };
  }
  if (role !== "planner") {
    return { ok: false, error: "Only trip planners can generate groceries." };
  }

  const safeHeadcount =
    Number.isFinite(headcount) && headcount > 0 ? Math.floor(headcount) : 1;

  // Custom meal names (recipe-linked meals are covered by computeRecipeProposals).
  const { data: mealPlan } = await supabase
    .from("trip_meal_plans")
    .select("id, trip_meals(custom_meal_name, recipe_id)")
    .eq("trip_id", tripId)
    .maybeSingle();

  const customMealNames: string[] = (
    (mealPlan?.trip_meals as
      | { custom_meal_name: string | null; recipe_id: string | null }[]
      | undefined) ?? []
  )
    .filter((m) => !m.recipe_id && m.custom_meal_name?.trim())
    .map((m) => m.custom_meal_name!.trim());

  // Recipe-derived items (exact, free) run regardless of headcount.
  let recipeItems: ProposedGroceryItem[];
  try {
    const proposals = await computeRecipeProposals(supabase, tripId);
    recipeItems = proposals.map((p) => ({
      name: p.name,
      quantity: round2(p.quantity),
      unit: p.unit || null,
      category: p.category || "Other",
      source: "recipe" as const,
    }));
  } catch (err) {
    console.error("[grocery-propose:recipe]", err);
    recipeItems = [];
  }

  // AI items for custom meals.
  let aiItems: ProposedGroceryItem[] = [];
  if (customMealNames.length > 0) {
    try {
      const suggestions = await generateGroceryFromMeals({
        mealNames: customMealNames,
        headcount: safeHeadcount,
        days: tripDays(trip.start_date, trip.end_date),
        destination: trip.destination,
        tripType: trip.trip_type,
      });
      aiItems = suggestions.map((s) => ({
        name: s.name,
        quantity: round2(s.quantity),
        unit: s.unit,
        category: s.category,
        source: "ai" as const,
      }));
    } catch (err) {
      console.error("[grocery-propose:ai]", err);
      // If recipe items exist, return them rather than failing the whole flow.
      if (recipeItems.length === 0) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? `AI gateway error: ${err.message}`
              : "Failed to generate suggestions. Please try again.",
        };
      }
    }
  }

  const items = [...recipeItems, ...aiItems];
  if (items.length === 0) {
    return {
      ok: false,
      error:
        "No meals to generate from. Add meals on the Meal Plan first (by name or with a recipe).",
    };
  }

  return { ok: true, items };
}
