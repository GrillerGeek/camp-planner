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
