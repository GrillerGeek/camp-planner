import "server-only";

import { generateText, Output } from "ai";
import { z } from "zod";
import type { Trip } from "@/lib/types/trip";
import type {
  DailyForecast,
  WeatherAssessment,
  WeatherNudge,
} from "@/lib/types/weather";
import { wmoLabel } from "@/lib/weather/wmo-icons";

const NudgeSchema = z.object({
  assessment: z
    .enum(["well_prepared", "has_gaps"])
    .describe("Overall verdict: well_prepared if no meaningful gaps."),
  nudges: z
    .array(
      z.object({
        title: z.string().describe("Short headline, e.g. 'No rain layer for Saturday'"),
        detail: z
          .string()
          .describe("1-2 sentences tying a specific forecast condition to a specific gap in the plan."),
        severity: z.enum(["info", "caution", "warning"]),
        related_days: z
          .array(z.string())
          .describe("YYYY-MM-DD trip days this nudge concerns."),
      })
    )
    .max(6),
});

interface GenerateWeatherNudgesArgs {
  trip: Pick<Trip, "destination" | "start_date" | "end_date" | "trip_type">;
  forecast: DailyForecast[];
  packingItems: { name: string; category: string; is_essential: boolean }[];
  meals: { day_date: string; meal_type: string; name: string }[];
}

export async function generateWeatherNudges({
  trip,
  forecast,
  packingItems,
  meals,
}: GenerateWeatherNudgesArgs): Promise<{
  assessment: WeatherAssessment;
  nudges: WeatherNudge[];
}> {
  const forecastLines = forecast
    .map(
      (f) =>
        `- ${f.date}: ${wmoLabel(f.weather_code)}, hi ${f.temp_high}°F / lo ${f.temp_low}°F, ` +
        `precip ${f.precip_probability}%, wind ${f.wind_speed}mph (gust ${f.wind_gust}mph)`
    )
    .join("\n");

  // Cap inputs to bound prompt size / AI cost (cf. meal-suggestions' 50-cap).
  const packingLines =
    packingItems
      .slice(0, 40)
      .map(
        (p) =>
          `- ${p.name} (${p.category})${p.is_essential ? " [essential]" : ""}`
      )
      .join("\n") || "(packing list is empty)";

  const mealLines =
    meals
      .slice(0, 30)
      .map((m) => `- ${m.day_date} ${m.meal_type}: ${m.name}`)
      .join("\n") || "(no meals planned)";

  const prompt = `You are reviewing a camping trip's readiness against the weather forecast.

Trip:
- Destination: ${trip.destination || "unspecified"}
- Dates: ${trip.start_date} to ${trip.end_date}
- Type: ${trip.trip_type ?? "unspecified"}

Forecast (in-window days only):
${forecastLines}

Current packing list:
${packingLines}

Current meal plan:
${mealLines}

Identify concrete gaps between the forecast and the plan. Rules:
- Tie every nudge to a SPECIFIC forecast condition AND a specific gap (or risk) in the packing list or meal plan. Reference the relevant day(s).
- Examples: a rain/storm day with no rain layer, shell, or tarp packed; a cold night with no warm layer; high wind against an open-flame/grill meal; a hot day with little water capacity.
- Do NOT invent items unrelated to the forecast. Do NOT restate things already covered well.
- If the plan already handles the conditions, return assessment "well_prepared" and an empty or near-empty nudges array.
- severity: "warning" for safety/comfort risks, "caution" for likely annoyances, "info" for minor optimizations.
- These are advisory only; never imply you have modified the lists.`;

  const { output } = await generateText({
    model: "anthropic/claude-sonnet-4.6",
    output: Output.object({ schema: NudgeSchema }),
    prompt,
  });

  return { assessment: output.assessment, nudges: output.nudges };
}
