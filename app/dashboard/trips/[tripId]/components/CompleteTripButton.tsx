"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface CompleteTripButtonProps {
  tripId: string;
}

export function CompleteTripButton({ tripId }: CompleteTripButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleComplete = async () => {
    setSaving(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("trips")
        .update({ status: "completed" })
        .eq("id", tripId);

      if (updateError) throw updateError;
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to complete trip."
      );
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  };

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 text-sm">
        {error}
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <p className="text-white text-sm mb-3">
          Mark this trip as completed? You can still revert it back to active
          later.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleComplete}
            disabled={saving}
            className="bg-camp-forest hover:bg-camp-pine text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? "Completing..." : "Yes, Complete Trip"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-camp-earth hover:text-white text-sm py-2 px-4 rounded-lg hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 hover:border-camp-forest/50 transition-colors text-left flex items-center gap-3"
    >
      <span className="text-xl">🏁</span>
      <div>
        <span className="text-white font-medium text-sm">Complete Trip</span>
        <p className="text-camp-earth/60 text-xs">
          Mark as done and start journaling
        </p>
      </div>
    </button>
  );
}
