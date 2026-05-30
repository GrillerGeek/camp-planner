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
