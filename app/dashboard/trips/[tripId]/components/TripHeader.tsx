import Link from "next/link";
import { Trip } from "@/lib/types/trip";
import { formatDateRange } from "@/lib/utils/dates";
import { DeleteTripDialog } from "./DeleteTripDialog";

interface TripHeaderProps {
  trip: Trip;
  userRole: "planner" | "viewer";
}

export function TripHeader({ trip, userRole }: TripHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard"
            className="text-camp-earth hover:text-white text-sm mb-2 inline-flex items-center gap-1 transition-colors"
          >
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
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
            Back to trips
          </Link>
          <h1 className="text-2xl font-bold text-white mt-1">{trip.name}</h1>
          <div className="flex items-center gap-4 mt-2">
            <span className="text-camp-earth text-sm flex items-center gap-1.5">
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
            </span>
            <span className="text-camp-earth/60 text-sm">
              {formatDateRange(trip.start_date, trip.end_date)}
            </span>
          </div>
          {trip.campsite_info && (
            <p className="text-camp-earth/50 text-sm mt-1">
              {trip.campsite_info}
            </p>
          )}
        </div>

        {userRole === "planner" && (
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/dashboard/trips/${trip.id}/edit`}
              className="text-camp-earth hover:text-white text-sm font-medium py-2 px-3 rounded-lg hover:bg-white/10 transition-colors"
            >
              Edit
            </Link>
            <DeleteTripDialog tripId={trip.id} tripName={trip.name} />
          </div>
        )}
      </div>
    </div>
  );
}
