"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface TripEndedBannerProps {
  tripId: string;
  endDate: string;
}

function formatEndDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function TripEndedBanner({ tripId, endDate }: TripEndedBannerProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleComplete() {
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("trips")
        .update({ status: "completed" })
        .eq("id", tripId);
      if (updateError) throw updateError;
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark complete.");
      setSaving(false);
    }
  }

  return (
    <div className="bg-camp-fire/10 border border-camp-fire/30 rounded-xl p-4 mb-6 flex items-center gap-4">
      <span className="text-2xl shrink-0">🏁</span>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium">
          This trip ended on {formatEndDate(endDate)}.
        </p>
        <p className="text-camp-earth/80 text-xs">
          Mark it complete to move it into your trip history and start a journal.
        </p>
        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      </div>
      <button
        onClick={handleComplete}
        disabled={saving}
        className="bg-camp-fire/80 hover:bg-camp-fire text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 shrink-0"
      >
        {saving ? "Completing..." : "Mark complete"}
      </button>
    </div>
  );
}
