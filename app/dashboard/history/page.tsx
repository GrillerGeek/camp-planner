"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Trip } from "@/lib/types/trip";

interface PastTrip extends Trip {
  journal_snippet?: string;
}

export default function HistoryPage() {
  const [trips, setTrips] = useState<PastTrip[]>([]);
  const [filteredTrips, setFilteredTrips] = useState<PastTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const supabase = createClient();

  useEffect(() => {
    async function loadTrips() {
      try {
        const { data: tripData, error } = await supabase
          .from("trips")
          .select("*")
          .eq("status", "completed")
          .order("end_date", { ascending: false });

        if (error) throw error;

        const completedTrips: PastTrip[] = tripData ?? [];

        // Fetch latest journal snippet for each trip
        for (const trip of completedTrips) {
          const { data: journalData } = await supabase
            .from("trip_journal_entries")
            .select("content")
            .eq("trip_id", trip.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (journalData?.content) {
            trip.journal_snippet =
              journalData.content.length > 120
                ? journalData.content.substring(0, 120) + "..."
                : journalData.content;
          }
        }

        setTrips(completedTrips);
        setFilteredTrips(completedTrips);
      } catch {
        // Silently handle errors
      } finally {
        setLoading(false);
      }
    }
    loadTrips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = useCallback(() => {
    let result = [...trips];

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.destination.toLowerCase().includes(q) ||
          (t.notes && t.notes.toLowerCase().includes(q)) ||
          (t.journal_snippet && t.journal_snippet.toLowerCase().includes(q))
      );
    }

    // Date range filter
    if (dateFrom) {
      result = result.filter((t) => t.start_date >= dateFrom);
    }
    if (dateTo) {
      result = result.filter((t) => t.end_date <= dateTo);
    }

    setFilteredTrips(result);
  }, [trips, search, dateFrom, dateTo]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const formatDateRange = (start: string, end: string) => {
    const s = new Date(start + "T00:00:00");
    const e = new Date(end + "T00:00:00");
    const opts: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
    };
    if (s.getFullYear() !== e.getFullYear()) {
      return `${s.toLocaleDateString("en-US", { ...opts, year: "numeric" })} - ${e.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
    }
    return `${s.toLocaleDateString("en-US", opts)} - ${e.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
  };

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="text-camp-earth">Loading past trips...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Trip History</h1>
        <p className="text-camp-earth text-sm">
          Browse and search your completed trips.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by destination, trip name, or keyword..."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-camp-earth/40 focus:outline-none focus:border-camp-forest"
            />
          </div>
          <div>
            <label className="block text-camp-earth/60 text-xs mb-1">
              From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-camp-forest"
            />
          </div>
          <div>
            <label className="block text-camp-earth/60 text-xs mb-1">
              To
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-camp-forest"
            />
          </div>
          <div className="flex items-end">
            {(search || dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setSearch("");
                  setDateFrom("");
                  setDateTo("");
                }}
                className="text-camp-earth hover:text-white text-sm py-2 px-3 rounded-lg hover:bg-white/10 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Empty state */}
      {trips.length === 0 && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🏕️</div>
          <h2 className="text-lg font-semibold text-white mb-2">
            No past trips yet
          </h2>
          <p className="text-camp-earth text-sm mb-6">
            Once you complete a trip, it will appear here with all your
            memories.
          </p>
          <Link
            href="/dashboard"
            className="inline-block bg-camp-forest hover:bg-camp-pine text-white font-medium py-2.5 px-5 rounded-lg transition-colors"
          >
            View your trips
          </Link>
        </div>
      )}

      {/* No results */}
      {trips.length > 0 && filteredTrips.length === 0 && (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-camp-earth text-sm">
            No trips match your search criteria.
          </p>
        </div>
      )}

      {/* Trip list */}
      {filteredTrips.length > 0 && (
        <div className="space-y-3">
          {filteredTrips.map((trip) => (
            <Link
              key={trip.id}
              href={`/dashboard/trips/${trip.id}`}
              className="block bg-white/5 border border-white/10 rounded-xl p-5 hover:border-white/20 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-semibold truncate">
                    {trip.name}
                  </h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-camp-earth text-sm">
                      {trip.destination}
                    </span>
                    <span className="text-camp-earth/40 text-sm">
                      {formatDateRange(trip.start_date, trip.end_date)}
                    </span>
                  </div>
                  {trip.journal_snippet && (
                    <p className="text-camp-earth/60 text-sm mt-2 line-clamp-2">
                      {trip.journal_snippet}
                    </p>
                  )}
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-camp-forest/20 text-camp-forest shrink-0">
                  Completed
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
