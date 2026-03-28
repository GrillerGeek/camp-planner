"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteTrip } from "@/lib/queries/trips";

interface DeleteTripDialogProps {
  tripId: string;
  tripName: string;
}

export function DeleteTripDialog({ tripId, tripName }: DeleteTripDialogProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [loading, setLoading] = useState(false);

  function open() {
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  async function handleDelete() {
    setLoading(true);
    try {
      const supabase = createClient();
      await deleteTrip(supabase, tripId);
      router.push("/dashboard");
    } catch {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={open}
        className="text-red-400 hover:text-red-300 text-sm font-medium py-2 px-3 rounded-lg hover:bg-red-400/10 transition-colors"
      >
        Delete
      </button>

      <dialog
        ref={dialogRef}
        className="bg-camp-night border border-white/10 rounded-xl p-6 max-w-sm w-full backdrop:bg-black/60 text-white"
      >
        <h3 className="text-lg font-semibold mb-2">Delete Trip</h3>
        <p className="text-camp-earth text-sm mb-6">
          Are you sure you want to delete &ldquo;{tripName}&rdquo;? This cannot
          be undone. All packing lists, meals, tasks, and reservations for this
          trip will be permanently removed.
        </p>
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={close}
            className="text-camp-earth hover:text-white py-2 px-4 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
          >
            {loading && (
              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            Delete Trip
          </button>
        </div>
      </dialog>
    </>
  );
}
