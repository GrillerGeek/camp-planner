import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTripsForUser } from "@/lib/queries/trips";
import { TripWithMemberCount } from "@/lib/types/trip";
import { TripCard } from "./components/TripCard";

type Bucket = "active" | "upcoming" | "needs_review" | "completed";

function bucketFor(trip: TripWithMemberCount, today: string): Bucket {
  if (trip.status === "completed") return "completed";
  // Compare YYYY-MM-DD strings — avoids timezone math on date-only columns.
  if (trip.start_date <= today && trip.end_date >= today) return "active";
  if (trip.end_date < today) return "needs_review";
  return "upcoming";
}

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

interface SectionProps {
  title: string;
  description?: string;
  tone?: "default" | "warning" | "muted";
  trips: TripWithMemberCount[];
  baseIndex: number;
}

function Section({ title, description, tone = "default", trips, baseIndex }: SectionProps) {
  if (trips.length === 0) return null;
  const titleColor =
    tone === "warning"
      ? "text-camp-fire"
      : tone === "muted"
      ? "text-camp-earth/80"
      : "text-white";
  return (
    <section className="mb-8 last:mb-0">
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className={`text-lg font-semibold ${titleColor}`}>{title}</h2>
        <span className="text-camp-earth/70 text-sm">
          {trips.length}
        </span>
      </div>
      {description && (
        <p className="text-camp-earth/70 text-sm mb-3">{description}</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {trips.map((trip, i) => (
          <TripCard key={trip.id} trip={trip} index={baseIndex + i} />
        ))}
      </div>
    </section>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] ?? "Camper";

  let trips: TripWithMemberCount[] = [];
  let loadError: string | null = null;
  try {
    trips = await getTripsForUser(supabase);
  } catch (err) {
    loadError =
      err instanceof Error
        ? err.message
        : "Couldn't load your trips. Try refreshing.";
  }

  const today = todayYMD();
  const buckets: Record<Bucket, TripWithMemberCount[]> = {
    active: [],
    upcoming: [],
    needs_review: [],
    completed: [],
  };
  for (const t of trips) {
    buckets[bucketFor(t, today)].push(t);
  }
  buckets.upcoming.sort((a, b) => a.start_date.localeCompare(b.start_date));
  buckets.active.sort((a, b) => a.start_date.localeCompare(b.start_date));
  buckets.needs_review.sort((a, b) => b.end_date.localeCompare(a.end_date));
  buckets.completed.sort((a, b) => b.end_date.localeCompare(a.end_date));

  // baseIndex keeps the accent-color rotation continuous across sections.
  let runningIndex = 0;
  const indexes = {
    active: ((): number => {
      const v = runningIndex;
      runningIndex += buckets.active.length;
      return v;
    })(),
    upcoming: ((): number => {
      const v = runningIndex;
      runningIndex += buckets.upcoming.length;
      return v;
    })(),
    needs_review: ((): number => {
      const v = runningIndex;
      runningIndex += buckets.needs_review.length;
      return v;
    })(),
    completed: ((): number => {
      const v = runningIndex;
      runningIndex += buckets.completed.length;
      return v;
    })(),
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">
            Welcome back, {firstName}!
          </h1>
          <p className="text-camp-earth">Your camping trip command center.</p>
        </div>
        <Link
          href="/dashboard/trips/new"
          className="bg-camp-forest hover:bg-camp-pine text-white text-sm font-medium py-2.5 px-5 rounded-lg transition-colors flex items-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          New Trip
        </Link>
      </div>

      {loadError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg p-4 mb-6 text-sm">
          {loadError}
        </div>
      )}

      {trips.length === 0 && !loadError ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🏕️</div>
          <h2 className="text-xl font-semibold text-white mb-2">
            No trips planned yet
          </h2>
          <p className="text-camp-earth mb-6 max-w-sm mx-auto">
            Create your first camping trip to start planning packing lists,
            meals, and more.
          </p>
          <Link
            href="/dashboard/trips/new"
            className="inline-block bg-camp-forest hover:bg-camp-pine text-white font-medium py-3 px-6 rounded-lg transition-colors"
          >
            Plan your first trip
          </Link>
        </div>
      ) : (
        <>
          <Section
            title="Active"
            description="Trips happening right now."
            trips={buckets.active}
            baseIndex={indexes.active}
          />
          <Section
            title="Upcoming"
            trips={buckets.upcoming}
            baseIndex={indexes.upcoming}
          />
          <Section
            title="Past — needs review"
            description="These trips ended. Mark them complete to move them to your trip history."
            tone="warning"
            trips={buckets.needs_review}
            baseIndex={indexes.needs_review}
          />
          <Section
            title="Completed"
            tone="muted"
            trips={buckets.completed}
            baseIndex={indexes.completed}
          />
        </>
      )}
    </div>
  );
}
