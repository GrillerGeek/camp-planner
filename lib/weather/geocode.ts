import "server-only";
import type { GeocodeOutcome, GeocodeResult } from "@/lib/types/weather";

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

/** US state/territory abbreviation → full name, as Open-Meteo reports it in
 *  `admin1`. Lets us match a "TN" qualifier against admin1 "Tennessee". */
const US_STATE_ABBREV: Record<string, string> = {
  al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california",
  co: "colorado", ct: "connecticut", de: "delaware", fl: "florida", ga: "georgia",
  hi: "hawaii", id: "idaho", il: "illinois", in: "indiana", ia: "iowa",
  ks: "kansas", ky: "kentucky", la: "louisiana", me: "maine", md: "maryland",
  ma: "massachusetts", mi: "michigan", mn: "minnesota", ms: "mississippi",
  mo: "missouri", mt: "montana", ne: "nebraska", nv: "nevada", nh: "new hampshire",
  nj: "new jersey", nm: "new mexico", ny: "new york", nc: "north carolina",
  nd: "north dakota", oh: "ohio", ok: "oklahoma", or: "oregon", pa: "pennsylvania",
  ri: "rhode island", sc: "south carolina", sd: "south dakota", tn: "tennessee",
  tx: "texas", ut: "utah", vt: "vermont", va: "virginia", wa: "washington",
  wv: "west virginia", wi: "wisconsin", wy: "wyoming", dc: "district of columbia",
};

/** Does `candidate` satisfy the user's `qualifier` (the text after the first
 *  comma, e.g. "TN", "Tennessee", "USA")? Used to rank the right candidate to
 *  the top when several places share a name.
 *
 *  TODO(jason): implement the matching strategy. A qualifier should match when
 *  it names the candidate's state/region (admin1) or country (country_code /
 *  country) — accounting for US state abbreviations via US_STATE_ABBREV.
 *  Consider: case-insensitivity, the abbreviation↔full-name expansion, and
 *  whether to match country_code ("US") as well as country ("United States").
 *  Return true on a confident match, false otherwise. */
function matchesQualifier(candidate: GeocodeResult, qualifier: string): boolean {
  const q = qualifier.trim().toLowerCase();
  if (!q) return false;
  // A "TN"-style abbrev expands to its full state name ("tennessee"); anything
  // else (already-full names like "tennessee") matches on its own.
  const expanded = US_STATE_ABBREV[q] ?? q;
  const fields = [
    candidate.admin1,
    candidate.country,
    candidate.country_code,
  ].map((f) => f?.trim().toLowerCase() ?? "");
  return fields.some((f) => f !== "" && (f === q || f === expanded));
}

/** Resolve a free-text place query to up to 5 candidate locations.
 *  Users type destinations as "City, ST" (e.g. "Norris, TN"), but Open-Meteo's
 *  `name` param only matches the bare locality — a comma+state suffix yields
 *  zero results. So we query with the locality alone and use any trailing
 *  qualifier to rank the intended candidate to the top.
 *
 *  Returns a discriminated GeocodeOutcome so callers can tell a genuine
 *  no-match ("not_found" — refine the destination) apart from a transient
 *  failure ("unavailable" — network error, timeout, or HTTP error; retry).
 *  Never throws. */
export async function geocodePlace(query: string): Promise<GeocodeOutcome> {
  const trimmed = query.trim();
  if (!trimmed) return { status: "not_found" };

  const [locality, ...rest] = trimmed.split(",").map((s) => s.trim());
  if (!locality) return { status: "not_found" };
  const qualifier = rest.filter(Boolean).join(", ");

  const url =
    `${GEOCODE_ENDPOINT}?name=${encodeURIComponent(locality)}` +
    `&count=5&language=en&format=json`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { status: "unavailable" };
    const json = (await res.json()) as { results?: OpenMeteoGeoResult[] };
    const candidates: GeocodeResult[] = (json.results ?? []).map((r) => ({
      name: r.name,
      admin1: r.admin1 ?? null,
      admin2: r.admin2 ?? null,
      country_code: r.country_code ?? null,
      country: r.country ?? null,
      latitude: r.latitude,
      longitude: r.longitude,
    }));

    if (candidates.length === 0) return { status: "not_found" };

    // Stable sort: qualifier matches first, original order otherwise.
    if (qualifier) {
      candidates.sort((a, b) => {
        const am = matchesQualifier(a, qualifier) ? 0 : 1;
        const bm = matchesQualifier(b, qualifier) ? 0 : 1;
        return am - bm;
      });
    }
    return { status: "ok", results: candidates };
  } catch {
    // network error / 5s timeout
    return { status: "unavailable" };
  }
}
