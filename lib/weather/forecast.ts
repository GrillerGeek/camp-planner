import "server-only";
import type { DailyForecast, ForecastResult } from "@/lib/types/weather";

const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
// Open-Meteo's daily forecast covers today (offset 0) through today+15 —
// 16 days inclusive. HORIZON_DAYS is the LAST available offset (15), so a
// trip ending exactly that far out reads as fully in-window and one ending
// later correctly flags truncated.
const HORIZON_DAYS = 15;

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
