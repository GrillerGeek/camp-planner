"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  DailyForecast,
  ForecastResult,
  GeocodeResult,
  WeatherAssessment,
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
  const [assessment, setAssessment] = useState<WeatherAssessment | null>(null);

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
    setAssessment(null);
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

          {nudges && nudges.length === 0 && assessment !== "well_prepared" && (
            <p className="text-sm text-camp-earth mt-3">
              No specific gaps found — still worth a glance at the forecast for your conditions.
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
