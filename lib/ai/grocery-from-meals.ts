import "server-only";

import { generateText, Output } from "ai";
import { z } from "zod";
import { GROCERY_CATEGORIES } from "@/lib/types/inventory";

// GROCERY_CATEGORIES is a readonly string tuple; z.enum needs a mutable tuple
// type, so we spread it. The values are the single source of truth shared with
// the manual-add form and the AiGenerateModal category dropdown.
const CategoryEnum = z.enum(
  GROCERY_CATEGORIES as unknown as [string, ...string[]]
);

const GrocerySuggestionSchema = z.object({
  items: z.array(
    z.object({
      name: z
        .string()
        .describe("Shopping-list item name, e.g. 'Hot dog buns' or 'Ground beef'"),
      quantity: z
        .number()
        .describe(
          "How many to buy, already scaled to the headcount and number of days."
        ),
      unit: z
        .string()
        .nullable()
        .describe(
          "Unit for the quantity (lbs, oz, cans, bottles, count, ...). Null for a plain count."
        ),
      category: CategoryEnum.describe(
        "One of the allowed grocery categories."
      ),
    })
  ),
});

export type GrocerySuggestion = z.infer<
  typeof GrocerySuggestionSchema
>["items"][number];

interface GenerateGroceryFromMealsArgs {
  mealNames: string[];
  headcount: number;
  days: number;
  destination?: string | null;
  tripType?: string | null;
}

export async function generateGroceryFromMeals({
  mealNames,
  headcount,
  days,
  destination,
  tripType,
}: GenerateGroceryFromMealsArgs): Promise<GrocerySuggestion[]> {
  const mealList = mealNames.map((m) => `- ${m}`).join("\n");
  const categories = GROCERY_CATEGORIES.join(", ");

  const prompt = `You are building a grocery shopping list for a camping trip.

Trip context:
- Cooking for: ${headcount} ${headcount === 1 ? "person" : "people"}
- Days of food to cover: ${days}
- Destination: ${destination || "unspecified"}
- Camp style: ${tripType || "unspecified"}

Planned meals (entered by name, no recipes attached):
${mealList}

Produce a practical grocery shopping list to cook these meals. Rules:
- Infer the actual ingredients each meal needs, then CONSOLIDATE shared
  ingredients across meals into a single line (e.g. buns used by both hot dogs
  and brats become one "buns" line with the combined quantity).
- Scale each quantity to roughly ${headcount} people across ${days} day(s).
- Choose a unit that matches how the item is bought (lbs, oz, cans, bottles,
  count, ...); use null for a plain count of whole items.
- Assign each item one category from this exact list: ${categories}.
- Skip pantry staples people obviously bring (salt, pepper, cooking oil) unless
  the item is central to a dish.
- Keep names short and shopping-oriented. Do not invent meals that were not listed.`;

  const { output } = await generateText({
    model: "anthropic/claude-sonnet-4.6",
    output: Output.object({ schema: GrocerySuggestionSchema }),
    prompt,
  });

  return output.items;
}
