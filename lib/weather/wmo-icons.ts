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
