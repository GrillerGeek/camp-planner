import "server-only";

import { generateText, Output } from "ai";
import { z } from "zod";
import type { Trip } from "@/lib/types/trip";
import type { Recipe, MealType } from "@/lib/types/meals";

const SuggestionSchema = z.object({
  suggestions: z
    .array(
      z.object({
        name: z
          .string()
          .describe("Short meal name, e.g. 'One-pot chili mac'"),
        description: z
          .string()
          .describe("1-2 sentence description of the meal."),
        why_suggested: z
          .string()
          .describe(
            "One sentence on why this meal fits the trip — season, destination, prep style, or matching the user's library."
          ),
        meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
        matching_recipe_id: z
          .string()
          .nullable()
          .describe(
            "UUID of an existing recipe from the library if one matches well; null if no library recipe fits."
          ),
      })
    )
    .length(5),
});

export type MealSuggestion = z.infer<
  typeof SuggestionSchema
>["suggestions"][number];

function deriveSeason(startDate: string): string {
  const month = new Date(startDate + "T00:00:00").getMonth() + 1;
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "fall";
  return "winter";
}

interface GenerateMealSuggestionsArgs {
  trip: Pick<
    Trip,
    "destination" | "start_date" | "end_date" | "campsite_info" | "notes"
  >;
  recipes: Pick<Recipe, "id" | "name" | "tags">[];
  existingMealTypes: MealType[];
}

export async function generateMealSuggestions({
  trip,
  recipes,
  existingMealTypes,
}: GenerateMealSuggestionsArgs): Promise<MealSuggestion[]> {
  const season = deriveSeason(trip.start_date);
  const recipeLibrary = recipes
    .slice(0, 50)
    .map(
      (r) =>
        `- id: ${r.id} | ${r.name}${
          r.tags?.length ? ` | tags: ${r.tags.join(", ")}` : ""
        }`
    )
    .join("\n");

  const alreadyPlanned =
    existingMealTypes.length > 0
      ? `Meal types already on this plan: ${existingMealTypes.join(
          ", "
        )}. Bias suggestions toward meal types with fewer entries.`
      : "No meals planned yet — feel free to suggest a balanced mix.";

  const prompt = `You are helping plan meals for a camping trip.

Trip details:
- Destination: ${trip.destination || "unspecified"}
- Dates: ${trip.start_date} to ${trip.end_date}
- Season: ${season}
- Campsite info: ${trip.campsite_info || "(none)"}
- Notes from the planner: ${trip.notes || "(none)"}

${alreadyPlanned}

Available recipe library (${recipes.length} recipes):
${recipeLibrary || "(empty)"}

Suggest exactly 5 meals that would fit this trip. For each suggestion:
- If a recipe from the library is a strong match, set matching_recipe_id to its uuid.
- Otherwise set matching_recipe_id to null.
- Prefer camp-friendly preparation: campfire, one-pot, no-cook, or grill methods.
- When destination hints at a region with notable local cuisine, factor that in.
- Vary the meal types across the 5 suggestions (mix of breakfast / lunch / dinner; use snack sparingly).
- Keep each name short and each description to 1-2 sentences.`;

  const { output } = await generateText({
    model: "anthropic/claude-sonnet-4.6",
    output: Output.object({ schema: SuggestionSchema }),
    prompt,
  });

  return output.suggestions;
}
