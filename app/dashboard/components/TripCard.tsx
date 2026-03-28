"use client";

import Link from "next/link";
import { TripWithMemberCount } from "@/lib/types/trip";
import { formatDateRange, getRelativeDate } from "@/lib/utils/dates";

const accentColors = [
  "bg-camp-forest",
  "bg-camp-sky",
  "bg-camp-fire",
  "bg-camp-pine",
];

export function TripCard({
  trip,
  index,
}: {
  trip: TripWithMemberCount;
  index: number;
}) {
  const accent = accentColors[index % accentColors.length];
  const relativeDate = getRelativeDate(trip.start_date);
  const isPast = new Date(trip.end_date + "T00:00:00") < new Date();

  return (
    <Link href={`/dashboard/trips/${trip.id}`}>
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:bg-white/10 transition-colors group">
        <div className={`h-1.5 ${accent}`} />
        <div className="p-5">
          <h3 className="text-white font-semibold text-lg mb-1 group-hover:text-camp-forest transition-colors">
            {trip.name}
          </h3>
          <p className="text-camp-earth text-sm flex items-center gap-1.5 mb-2">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
              />
            </svg>
            {trip.destination}
          </p>
          <p className="text-camp-earth/70 text-xs mb-3">
            {formatDateRange(trip.start_date, trip.end_date)}
          </p>
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                isPast
                  ? "bg-camp-earth/20 text-camp-earth"
                  : "bg-camp-forest/20 text-camp-forest"
              }`}
            >
              {relativeDate}
            </span>
            <span className="text-camp-earth/50 text-xs">
              {trip.member_count} {trip.member_count === 1 ? "member" : "members"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
