# Weather-Aware Trip Prep (SPEC-010) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a weather forecast + AI "weather readiness" check to the trip dashboard, grounded in the trip's resolved location.

**Architecture:** A one-time geocode resolves the trip's free-text `destination` to stored coordinates (migration 025). The trip page server-fetches an Open-Meteo daily forecast (keyless, cached via the Next data cache) and renders it in a `WeatherCard` client island. On demand, a planner-gated Server Action reasons over the forecast + packing list + meal plan via the AI Gateway and returns advisory nudges. Forecast is cheap/automatic; AI nudges are on-demand (hybrid trigger).

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Supabase (Postgres + RLS), Vercel AI Gateway (`ai` SDK), Tailwind v4 (`camp-*` tokens), Open-Meteo (geocoding + forecast, no API key).

---

## ⚠️ Project-specific conventions (read before starting)

- **No test runner exists.** Per `CLAUDE.md`, validation is `npm run typecheck`, `npm run lint`, `npm run build` (automated gates) plus **manual human-review** for UI/AI behavior — exactly how prior specs (e.g. SPEC-008b.1) were validated. This plan uses those gates instead of unit tests. Do **not** add a test framework.
- **AGENTS.md:** this is Next.js **16** — `fetch` is **not** cached by default; cache opt-in is explicit (`next: { revalidate }`). Don't assume Next 14/15 behavior.
- **Data access:** Supabase only via `lib/queries/<domain>.ts` (each takes `SupabaseClient` first arg). External HTTP lives in `server-only` `lib/weather/*` — never in `lib/queries`.
- **AI:** `server-only` `lib/ai/<feature>.ts` using `generateText` + `Output.object` + Zod, model string `"anthropic/claude-sonnet-4.6"`. Invoked from co-located `actions.ts` Server Actions wrapped in `{ ok: true | false }`. Reference: `lib/ai/meal-suggestions.ts`, `app/dashboard/trips/[tripId]/meals/actions.ts`.
- **Styling:** `camp-*` Tailwind tokens only (`camp-forest`, `camp-pine`, `camp-earth`, `camp-sky`, `camp-fire`, `camp-night`, `camp-sand`). No hand-rolled hex.
- **All commits** end with the repo trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Local AI env:** the readiness action needs `AI_GATEWAY_API_KEY` (or a fresh `VERCEL_OIDC_TOKEN` via `vercel env pull`). Forecast/geocode need no secret.

---

## File Structure

**Create:**
- `supabase/migrations/025_trips_weather_location.sql` — coords + CHECK constraints on `trips`
- `lib/types/weather.ts` — `DailyForecast`, `GeocodeResult`, `WeatherNudge`, `ForecastResult`
- `lib/weather/wmo-icons.ts` — WMO code → emoji/label (pure)
- `lib/weather/geocode.ts` — Open-Meteo geocoding (`server-only`)
- `lib/weather/forecast.ts` — Open-Meteo forecast + horizon math + cache (`server-only`)
- `lib/ai/weather-nudges.ts` — AI nudge generation (`server-only`)
- `app/dashboard/trips/[tripId]/weather/actions.ts` — 3 Server Actions
- `app/dashboard/trips/[tripId]/components/WeatherCard.tsx` — client island

**Modify:**
- `lib/types/trip.ts` — add `latitude`, `longitude`, `location_label` to `Trip`
- `lib/queries/trips.ts` — add `updateTripLocation`
- `app/dashboard/trips/[tripId]/page.tsx` — guarded forecast fetch + render `WeatherCard`

Build order is bottom-up so every task type-checks independently.

---

## Task 1: Migration 025 + Trip type extension

**Files:**
- Create: `supabase/migrations/025_trips_weather_location.sql`
- Modify: `lib/types/trip.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/025_trips_weather_location.sql`:

```sql
-- SPEC-010: weather-aware trip prep — store the resolved campsite location.
-- Additive + backward-compatible. Existing trips read null = "location not
-- yet resolved". Coordinates are client-supplied via a Server Action, so the
-- range CHECK constraints are the authoritative trust boundary (cf. SPEC-010
-- review blocker 3). No RLS change: columns inherit the existing trips row
-- policies.

alter table public.trips
  add column latitude double precision,
  add column longitude double precision,
  add column location_label text;

alter table public.trips
  add constraint trips_latitude_range_check
    check (latitude is null or latitude between -90 and 90),
  add constraint trips_longitude_range_check
    check (longitude is null or longitude between -180 and 180),
  add constraint trips_location_label_length_check
    check (location_label is null or char_length(location_label) <= 200);
```

- [ ] **Step 2: Apply the migration to Supabase**

Apply via the Supabase SQL editor (paste the file) **or**, if the Supabase CLI is linked, `supabase db push`. There is no project-local migration runner script — the `supabase/migrations/` files are the source of truth applied to the hosted DB.

Expected: `ALTER TABLE` succeeds; `trips` now has `latitude`, `longitude`, `location_label`.

- [ ] **Step 3: Extend the Trip type**

In `lib/types/trip.ts`, add three fields to the `Trip` interface, immediately after `trip_type`:

```ts
  trip_type: "tent" | "rv" | "cabin" | "backpacking" | null;
  /** SPEC-010: resolved campsite location. Null = not yet geocoded.
   *  Range-validated at the DB layer (migration 025). */
  latitude: number | null;
  longitude: number | null;
  location_label: string | null;
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors). The new fields are optional reads; existing code that spreads `Trip` is unaffected.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/025_trips_weather_location.sql lib/types/trip.ts
git commit -m "SPEC-010: migration 025 — trips lat/lng/location_label + Trip type"
```

---

## Task 2: Weather types

**Files:**
- Create: `lib/types/weather.ts`

- [ ] **Step 1: Write the types**

Create `lib/types/weather.ts`:

```ts
/** SPEC-010 weather-aware trip prep types. */

/** One day of forecast, already unit-converted (°F / mph). */
export interface DailyForecast {
  date: string; // YYYY-MM-DD (local to the forecast location)
  temp_high: number; // °F
  temp_low: number; // °F
  precip_probability: number; // 0–100
  wind_speed: number; // mph (daily max)
  wind_gust: number; // mph (daily max gust)
  weather_code: number; // WMO weather interpretation code
}

/** A geocoding candidate from Open-Meteo, fields kept explicit so the picker
 *  can disambiguate same-named places. */
export interface GeocodeResult {
  name: string;
  admin1: string | null; // state / province
  admin2: string | null; // county / district
  country_code: string | null; // ISO-3166 alpha-2
  country: string | null;
  latitude: number;
  longitude: number;
}

export type NudgeSeverity = "info" | "caution" | "warning";

/** One advisory weather-readiness suggestion. Advisory text only — never
 *  mutates the packing list or meal plan (SPEC-010 boundary). */
export interface WeatherNudge {
  title: string;
  detail: string;
  severity: NudgeSeverity;
  related_days: string[]; // YYYY-MM-DD dates this nudge concerns
}

export type WeatherAssessment = "well_prepared" | "has_gaps";

/** Discriminated result of a forecast fetch. `truncated` = the trip extends
 *  past the provider's ~16-day window (straddling trip). */
export type ForecastResult =
  | { status: "ok"; days: DailyForecast[]; truncated: boolean }
  | { status: "beyond_horizon" }
  | { status: "unavailable" };
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/types/weather.ts
git commit -m "SPEC-010: weather domain types"
```

---

## Task 3: WMO weather-code icon map

**Files:**
- Create: `lib/weather/wmo-icons.ts`

- [ ] **Step 1: Write the helper**

Create `lib/weather/wmo-icons.ts`:

```ts
/** WMO weather interpretation code -> emoji icon + short label.
 *  Pure functions, consumed by the WeatherCard forecast strip so the
 *  component never invents ad-hoc icon logic (SPEC-010 review suggestion). */

export function wmoIcon(code: number): string {
  if (code === 0) return "☀️"; // clear
  if (code <= 2) return "🌤️"; // mainly clear / partly cloudy
  if (code === 3) return "☁️"; // overcast
  if (code >= 45 && code <= 48) return "🌫️"; // fog
  if (code >= 51 && code <= 57) return "🌦️"; // drizzle
  if (code >= 61 && code <= 67) return "🌧️"; // rain
  if (code >= 71 && code <= 77) return "❄️"; // snow
  if (code >= 80 && code <= 82) return "🌧️"; // rain showers
  if (code >= 85 && code <= 86) return "🌨️"; // snow showers
  if (code >= 95) return "⛈️"; // thunderstorm
  return "🌡️";
}

export function wmoLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code >= 45 && code <= 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95) return "Thunderstorm";
  return "Unknown";
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/weather/wmo-icons.ts
git commit -m "SPEC-010: WMO weather-code icon/label helper"
```

---

## Task 4: Geocoding module

**Files:**
- Create: `lib/weather/geocode.ts`

- [ ] **Step 1: Write the geocoder**

Create `lib/weather/geocode.ts`. Note: the function is named `geocodePlace` to avoid colliding with the `geocodeDestination` Server Action (Task 8).

```ts
import "server-only";
import type { GeocodeResult } from "@/lib/types/weather";

const GEOCODE_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";

interface OpenMeteoGeoResult {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  country_code?: string;
  admin1?: string;
  admin2?: string;
}

/** Resolve a free-text place query to up to 5 candidate locations.
 *  Returns [] on no match, error, or timeout — callers surface that as
 *  "couldn't find that place". Never throws. */
export async function geocodePlace(query: string): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const url =
    `${GEOCODE_ENDPOINT}?name=${encodeURIComponent(trimmed)}` +
    `&count=5&language=en&format=json`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: OpenMeteoGeoResult[] };
    return (json.results ?? []).map((r) => ({
      name: r.name,
      admin1: r.admin1 ?? null,
      admin2: r.admin2 ?? null,
      country_code: r.country_code ?? null,
      country: r.country ?? null,
      latitude: r.latitude,
      longitude: r.longitude,
    }));
  } catch {
    // network error / 5s timeout — treat as no results
    return [];
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/weather/geocode.ts
git commit -m "SPEC-010: Open-Meteo geocoding module (server-only, timeout, top-5)"
```

---

## Task 5: Forecast module

**Files:**
- Create: `lib/weather/forecast.ts`

- [ ] **Step 1: Write the forecast fetcher with horizon math + cache**

Create `lib/weather/forecast.ts`:

```ts
import "server-only";
import type { DailyForecast, ForecastResult } from "@/lib/types/weather";

const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const HORIZON_DAYS = 16; // Open-Meteo daily forecast window from today

/** Add `n` days to a YYYY-MM-DD string, returning YYYY-MM-DD.
 *  Parsed as a UTC date to avoid DST/local-offset drift in the arithmetic. */
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

interface OpenMeteoDaily {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_probability_max: (number | null)[];
  wind_speed_10m_max: number[];
  wind_gusts_10m_max: number[];
  weather_code: number[];
}

interface GetForecastArgs {
  tripId: string; // used for the cache tag
  latitude: number;
  longitude: number;
  startDate: string; // trip.start_date (YYYY-MM-DD)
  endDate: string; // trip.end_date (YYYY-MM-DD)
  today: string; // caller-provided YYYY-MM-DD (page uses todayYMD())
}

/** Fetch the daily forecast for the in-window portion of a trip.
 *  Horizon is computed relative to `today` (the provider window is relative
 *  to now). ISO date strings compare lexicographically, so plain >/< works. */
export async function getTripForecast(
  args: GetForecastArgs
): Promise<ForecastResult> {
  const { tripId, latitude, longitude, startDate, endDate, today } = args;

  const maxDate = addDays(today, HORIZON_DAYS);
  const effectiveStart = startDate > today ? startDate : today;
  const effectiveEnd = endDate < maxDate ? endDate : maxDate;

  // Whole trip is beyond the forecast window (or ends before today — past
  // trips are suppressed by the caller, so this is the future-beyond case).
  if (effectiveStart > effectiveEnd) {
    return { status: "beyond_horizon" };
  }
  const truncated = endDate > maxDate;

  // Deterministic URL → stable Next data-cache key. Round coords to 2 dp.
  const lat = latitude.toFixed(2);
  const lon = longitude.toFixed(2);
  const url =
    `${FORECAST_ENDPOINT}?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,` +
    `wind_speed_10m_max,wind_gusts_10m_max,weather_code` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto` +
    `&start_date=${effectiveStart}&end_date=${effectiveEnd}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      // Next 16: fetch is NOT cached by default — opt in explicitly.
      next: { revalidate: 21600, tags: [`trip-forecast:${tripId}`] },
    });
    if (!res.ok) return { status: "unavailable" };

    const json = (await res.json()) as { daily?: OpenMeteoDaily };
    const daily = json.daily;
    if (!daily?.time?.length) return { status: "unavailable" };

    const days: DailyForecast[] = daily.time.map((date, i) => ({
      date,
      temp_high: Math.round(daily.temperature_2m_max[i]),
      temp_low: Math.round(daily.temperature_2m_min[i]),
      precip_probability: daily.precipitation_probability_max[i] ?? 0,
      wind_speed: Math.round(daily.wind_speed_10m_max[i]),
      wind_gust: Math.round(daily.wind_gusts_10m_max[i]),
      weather_code: daily.weather_code[i],
    }));

    return { status: "ok", days, truncated };
  } catch {
    // 5s timeout or network error → degraded state
    return { status: "unavailable" };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/weather/forecast.ts
git commit -m "SPEC-010: Open-Meteo forecast module — horizon math, cache tags, timeout"
```

---

## Task 6: `updateTripLocation` query helper

**Files:**
- Modify: `lib/queries/trips.ts`

- [ ] **Step 1: Add the helper**

In `lib/queries/trips.ts`, add after `updateTrip` (keep the `SupabaseClient`-first convention):

```ts
/** SPEC-010: persist a resolved campsite location on a trip. Coordinate
 *  range is enforced by migration 025 CHECK constraints at the DB layer;
 *  the caller (saveTripLocation action) validates the payload shape first. */
export async function updateTripLocation(
  supabase: SupabaseClient,
  tripId: string,
  loc: { latitude: number; longitude: number; label: string }
): Promise<Trip> {
  const { data, error } = await supabase
    .from("trips")
    .update({
      latitude: loc.latitude,
      longitude: loc.longitude,
      location_label: loc.label.trim(),
    })
    .eq("id", tripId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/queries/trips.ts
git commit -m "SPEC-010: updateTripLocation query helper"
```

---

## Task 7: AI weather-nudges module

**Files:**
- Create: `lib/ai/weather-nudges.ts`

- [ ] **Step 1: Write the AI module (mirrors meal-suggestions.ts)**

Create `lib/ai/weather-nudges.ts`:

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/weather-nudges.ts
git commit -m "SPEC-010: AI weather-nudges module (capped inputs, pinned model, .max(6))"
```

---

## Task 8: Server Actions (planner-gated)

**Files:**
- Create: `app/dashboard/trips/[tripId]/weather/actions.ts`

- [ ] **Step 1: Write the three actions**

Create `app/dashboard/trips/[tripId]/weather/actions.ts`:

```ts
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

  const candidates = await geocodePlace(trip.destination);
  if (candidates.length === 0) {
    return { ok: false, error: "Couldn't find that place — try refining the destination." };
  }
  return { ok: true, candidates };
}

export async function saveTripLocation(
  tripId: string,
  choice: { latitude: number; longitude: number; label: string }
): Promise<Result<Record<string, never>>> {
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
    revalidateTag(`trip-forecast:${tripId}`); // drop any stale cached forecast
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
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. (If lint flags the `Record<string, never>` success shape, it is intentional — `saveTripLocation` returns no extra payload.)

- [ ] **Step 3: Commit**

```bash
git add "app/dashboard/trips/[tripId]/weather/actions.ts"
git commit -m "SPEC-010: weather Server Actions — planner gates + payload validation"
```

---

## Task 9: WeatherCard client island

**Files:**
- Create: `app/dashboard/trips/[tripId]/components/WeatherCard.tsx`

- [ ] **Step 1: Write the component**

Create `app/dashboard/trips/[tripId]/components/WeatherCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  DailyForecast,
  ForecastResult,
  GeocodeResult,
  WeatherNudge,
} from "@/lib/types/weather";
import { wmoIcon, wmoLabel } from "@/lib/weather/wmo-icons";
import {
  geocodeDestination,
  saveTripLocation,
  checkWeatherReadiness,
} from "../weather/actions";

interface WeatherCardProps {
  tripId: string;
  role: "planner" | "viewer";
  locationLabel: string | null;
  hasCoords: boolean;
  forecast: ForecastResult | null;
}

function labelFor(c: GeocodeResult): string {
  return [c.name, c.admin1, c.country_code].filter(Boolean).join(", ");
}

function severityClasses(severity: WeatherNudge["severity"]): string {
  if (severity === "warning") return "border-camp-fire/40 bg-camp-fire/10";
  if (severity === "caution") return "border-camp-sky/40 bg-camp-sky/10";
  return "border-white/10 bg-white/5";
}

export function WeatherCard({
  tripId,
  role,
  locationLabel,
  hasCoords,
  forecast,
}: WeatherCardProps) {
  const router = useRouter();
  const isPlanner = role === "planner";

  const [candidates, setCandidates] = useState<GeocodeResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nudges, setNudges] = useState<WeatherNudge[] | null>(null);
  const [assessment, setAssessment] = useState<string | null>(null);

  async function handleFindLocation() {
    setBusy(true);
    setError(null);
    const res = await geocodeDestination(tripId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCandidates(res.candidates);
  }

  async function handlePick(c: GeocodeResult) {
    setBusy(true);
    setError(null);
    const res = await saveTripLocation(tripId, {
      latitude: c.latitude,
      longitude: c.longitude,
      label: labelFor(c),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCandidates(null);
    router.refresh(); // re-fetch the server-rendered forecast
  }

  async function handleCheckReadiness(days: DailyForecast[]) {
    setBusy(true);
    setError(null);
    setNudges(null);
    const res = await checkWeatherReadiness(tripId, days);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setAssessment(res.assessment);
    setNudges(res.nudges);
  }

  const heading = (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-base font-semibold text-white flex items-center gap-2">
        <span>🌦️</span> Weather
      </h3>
      {locationLabel && (
        <span className="text-xs text-camp-earth">{locationLabel}</span>
      )}
    </div>
  );

  const shell = "bg-white/5 border border-white/10 rounded-xl p-4 mb-6";

  // --- Unresolved: no coordinates yet ---
  if (!hasCoords) {
    return (
      <div className={shell}>
        {heading}
        {!isPlanner ? (
          <p className="text-sm text-camp-earth">
            No location set for this trip yet.
          </p>
        ) : candidates ? (
          <div>
            <p className="text-sm text-camp-earth mb-2">Pick the right place:</p>
            <ul className="space-y-2">
              {candidates.map((c, i) => (
                <li key={`${c.latitude},${c.longitude},${i}`}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handlePick(c)}
                    className="w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-camp-forest/30 text-white text-sm transition-colors disabled:opacity-50"
                  >
                    {labelFor(c)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={handleFindLocation}
            className="bg-camp-forest hover:bg-camp-pine text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            {busy ? "Finding…" : "Set location for weather"}
          </button>
        )}
        {error && <p className="text-sm text-camp-fire mt-2">{error}</p>}
      </div>
    );
  }

  // --- Resolved but beyond the forecast horizon ---
  if (!forecast || forecast.status === "beyond_horizon") {
    return (
      <div className={shell}>
        {heading}
        <p className="text-sm text-camp-earth">
          Forecast available closer to your trip.
        </p>
      </div>
    );
  }

  // --- Resolved but the provider is unavailable ---
  if (forecast.status === "unavailable") {
    return (
      <div className={shell}>
        {heading}
        <p className="text-sm text-camp-earth">Weather unavailable right now.</p>
      </div>
    );
  }

  // --- Resolved + in-window forecast ---
  return (
    <div className={shell}>
      {heading}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {forecast.days.map((d) => (
          <div
            key={d.date}
            className="flex-shrink-0 w-20 text-center bg-white/5 rounded-lg p-2"
            title={wmoLabel(d.weather_code)}
          >
            <div className="text-xs text-camp-earth">{d.date.slice(5)}</div>
            <div className="text-xl">{wmoIcon(d.weather_code)}</div>
            <div className="text-sm text-white">
              {d.temp_high}°<span className="text-camp-earth">/{d.temp_low}°</span>
            </div>
            <div className="text-[10px] text-camp-sky">{d.precip_probability}%💧</div>
            <div className="text-[10px] text-camp-earth">{d.wind_speed}mph</div>
          </div>
        ))}
      </div>

      {forecast.truncated && (
        <p className="text-xs text-camp-earth mt-2">
          Later days appear as your trip gets closer.
        </p>
      )}

      {isPlanner && (
        <div className="mt-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => handleCheckReadiness(forecast.days)}
            className="bg-camp-forest hover:bg-camp-pine text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            {busy ? "Checking…" : "Check weather readiness"}
          </button>

          {error && <p className="text-sm text-camp-fire mt-2">{error}</p>}

          {nudges && nudges.length === 0 && assessment === "well_prepared" && (
            <p className="text-sm text-camp-pine mt-3">
              ✅ You look well prepared for the forecast.
            </p>
          )}

          {nudges && nudges.length > 0 && (
            <ul className="space-y-2 mt-3">
              {nudges.map((n, i) => (
                <li
                  key={i}
                  className={`border rounded-lg p-3 ${severityClasses(n.severity)}`}
                >
                  <p className="text-sm font-medium text-white">{n.title}</p>
                  <p className="text-sm text-camp-earth mt-1">{n.detail}</p>
                  {n.related_days.length > 0 && (
                    <p className="text-xs text-camp-earth/70 mt-1">
                      {n.related_days.join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/dashboard/trips/[tripId]/components/WeatherCard.tsx"
git commit -m "SPEC-010: WeatherCard client island (states, forecast strip, nudges)"
```

---

## Task 10: Wire WeatherCard into the trip page

**Files:**
- Modify: `app/dashboard/trips/[tripId]/page.tsx`

- [ ] **Step 1: Add imports**

In `app/dashboard/trips/[tripId]/page.tsx`, add to the import block:

```ts
import { WeatherCard } from "./components/WeatherCard";
import { getTripForecast } from "@/lib/weather/forecast";
import type { ForecastResult } from "@/lib/types/weather";
```

- [ ] **Step 2: Fetch the forecast after the trip resolves**

The forecast depends on `trip.latitude`, which is fetched in the existing `Promise.all`, so it must run *after* that block. Add this immediately after the `if (!trip || !role)` not-found guard (so `trip` is non-null), and after `isPast` is computed:

```ts
  const isPast = trip.end_date < todayYMD();
  const showEndedBanner =
    isPast && trip.status !== "completed" && role === "planner";

  // SPEC-010: only fetch weather for upcoming, non-completed, located trips.
  const showWeather =
    !isPast && trip.status !== "completed" && trip.latitude != null && trip.longitude != null;
  let forecast: ForecastResult | null = null;
  if (showWeather) {
    forecast = await getTripForecast({
      tripId,
      latitude: trip.latitude as number,
      longitude: trip.longitude as number,
      startDate: trip.start_date,
      endDate: trip.end_date,
      today: todayYMD(),
    });
  }
```

- [ ] **Step 3: Render the card**

Render `WeatherCard` above the "Trip Readiness" heading. It shows the "set location" prompt itself when there are no coords, so render it whenever the trip is upcoming/non-completed (planner or viewer). Insert just before `<h2 ...>Trip Readiness</h2>`:

```tsx
      {!isPast && trip.status !== "completed" && (
        <WeatherCard
          tripId={tripId}
          role={role}
          locationLabel={trip.location_label}
          hasCoords={trip.latitude != null && trip.longitude != null}
          forecast={forecast}
        />
      )}

      <h2 className="text-lg font-semibold text-white mb-4">Trip Readiness</h2>
```

- [ ] **Step 4: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all PASS. The build confirms the Server Component + client island wiring compiles.

- [ ] **Step 5: Commit**

```bash
git add "app/dashboard/trips/[tripId]/page.tsx"
git commit -m "SPEC-010: wire WeatherCard + forecast fetch into trip dashboard"
```

---

## Task 11: Manual validation pass (human-review)

No automated UI/AI tests exist — validate against the spec's `validation` block by hand. Ensure `AI_GATEWAY_API_KEY` (or a fresh `VERCEL_OIDC_TOKEN`) is set for the readiness step.

- [ ] **Step 1: Start the app**

Run: `npm run dev`
Open a trip you can plan (planner role), with a real, geocodable `destination` and `start_date` within ~14 days.

- [ ] **Step 2: EXP-032 — location + forecast**

- [ ] Trip with no coords shows **"Set location for weather"**.
- [ ] Click it; an ambiguous destination (e.g. "Cedar Lake") shows **multiple candidates** with region context.
- [ ] Pick one; the card stores the location and renders a **per-day forecast strip** aligned to the trip days.
- [ ] Temporarily set a trip `start_date` > 16 days out → **"Forecast available closer to your trip."**
- [ ] Edit a trip's destination to gibberish, re-resolve → **"Couldn't find that place"** message; dashboard still renders.

- [ ] **Step 3: EXP-033 — AI readiness**

- [ ] With an in-window forecast, click **"Check weather readiness"**.
- [ ] On a trip whose forecast has a rain day and a packing list lacking any rain layer, a nudge **flags the gap** referencing the day.
- [ ] On a well-covered plan → **"You look well prepared"**.
- [ ] Empty packing/meal plan → baseline suggestions, no crash.
- [ ] Simulate an AI failure (unset `AI_GATEWAY_API_KEY`, restart) → **inline retryable error**, nothing persisted.

- [ ] **Step 4: EXP-034 — roles & trip state**

- [ ] As a **viewer** on a resolved trip: forecast renders **read-only**, no "Set location" / "Check readiness" buttons.
- [ ] (Optional) Invoke the actions directly as a viewer (e.g. via a crafted call) → rejected with "Only planners can do that."
- [ ] A **completed/past** trip renders **no weather card**.
- [ ] A second planner sees the location resolved by the first **without re-resolving**.

- [ ] **Step 5: Cross-cutting**

- [ ] No new env secret required for forecast/geocode (Open-Meteo keyless).
- [ ] Repeat dashboard loads within ~6h don't re-hit Open-Meteo (check the dev Network tab / server logs — the cached fetch should not fire each load).
- [ ] In Supabase, attempt `update trips set latitude = 999 where id = '<trip>'` → rejected by the CHECK constraint.

- [ ] **Step 6: Record results**

Create `docs/specs/SPEC-010-test-log.md` capturing pass/fail per check (mirrors `SPEC-008b.1-test-log.md`), then commit:

```bash
git add docs/specs/SPEC-010-test-log.md
git commit -m "SPEC-010: manual validation test log"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** EXP-032 → Tasks 1,4,5,8,9,10 + validation step 2. EXP-033 → Tasks 7,8,9 + step 3. EXP-034 → Tasks 8 (planner gates), 9 (role-conditional UI), 10 (past/completed guard) + step 4. All `deliverables` map to a task (migration→T1, types→T2, wmo-icons→T3, geocode→T4, forecast→T5, updateTripLocation→T6, weather-nudges→T7, actions→T8, WeatherCard→T9, page wiring→T10).
- **Blocker coverage:** B1 planner gate → Task 8 `requirePlanner` (hard gate first in `checkWeatherReadiness`). B2 Next-16 cache → Task 5 explicit `next:{revalidate,tags}` + deterministic key + Task 8 action receives forecast (no re-fetch). B3 validation → Task 1 mandatory CHECK + Task 8 concrete payload checks.
- **Type consistency:** `geocodePlace` (lib) vs `geocodeDestination` (action) deliberately distinct; `ForecastResult` discriminant (`ok`/`beyond_horizon`/`unavailable`) used identically in Tasks 5, 9, 10; `getTripPackingList` returns `trip_packing_items`, `getTripMealPlan` returns `trip_meals` (verified against the query modules).
- **Placeholders:** none — every code step is complete.
```
