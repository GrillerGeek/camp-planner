"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createTrip, updateTrip } from "@/lib/queries/trips";
import { Trip, TripFormData } from "@/lib/types/trip";

interface TripFormProps {
  mode: "create" | "edit";
  initialData?: Trip;
}

export function TripForm({ mode, initialData }: TripFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState<TripFormData>({
    name: initialData?.name ?? "",
    destination: initialData?.destination ?? "",
    start_date: initialData?.start_date ?? "",
    end_date: initialData?.end_date ?? "",
    campsite_info: initialData?.campsite_info ?? "",
    notes: initialData?.notes ?? "",
  });

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    if (!form.name.trim()) newErrors.name = "Trip name is required";
    else if (form.name.trim().length > 200)
      newErrors.name = "Trip name must be 200 characters or less";

    if (!form.destination.trim())
      newErrors.destination = "Destination is required";
    else if (form.destination.trim().length > 500)
      newErrors.destination = "Destination must be 500 characters or less";

    if (!form.start_date) newErrors.start_date = "Start date is required";
    if (!form.end_date) newErrors.end_date = "End date is required";

    if (form.start_date && form.end_date && form.end_date < form.start_date)
      newErrors.end_date = "End date must be on or after start date";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const supabase = createClient();
      if (mode === "create") {
        const trip = await createTrip(supabase, form);
        router.push(`/dashboard/trips/${trip.id}`);
      } else if (initialData) {
        await updateTrip(supabase, initialData.id, form);
        router.push(`/dashboard/trips/${initialData.id}`);
      }
    } catch (err) {
      setErrors({ form: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  function handleChange(
    field: keyof TripFormData,
    value: string
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl">
      {errors.form && (
        <div className="bg-red-900/30 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg mb-6 text-sm">
          {errors.form}
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-white mb-1.5">
            Trip Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="e.g., Summer Lake Trip 2026"
            maxLength={200}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
          />
          {errors.name && (
            <p className="text-red-400 text-xs mt-1">{errors.name}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-1.5">
            Destination <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.destination}
            onChange={(e) => handleChange("destination", e.target.value)}
            placeholder="e.g., Smoky Mountains, TN"
            maxLength={500}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
          />
          {errors.destination && (
            <p className="text-red-400 text-xs mt-1">{errors.destination}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">
              Start Date <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => handleChange("start_date", e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent [color-scheme:dark]"
            />
            {errors.start_date && (
              <p className="text-red-400 text-xs mt-1">{errors.start_date}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">
              End Date <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={form.end_date}
              onChange={(e) => handleChange("end_date", e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent [color-scheme:dark]"
            />
            {errors.end_date && (
              <p className="text-red-400 text-xs mt-1">{errors.end_date}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-1.5">
            Campsite Info
          </label>
          <textarea
            value={form.campsite_info}
            onChange={(e) => handleChange("campsite_info", e.target.value)}
            placeholder="e.g., Site #42, Loop B, Electric hookup"
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-1.5">
            Notes
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => handleChange("notes", e.target.value)}
            placeholder="Any other details..."
            rows={3}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent resize-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-8">
        <button
          type="submit"
          disabled={loading}
          className="bg-camp-forest hover:bg-camp-pine disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 px-6 rounded-lg transition-colors flex items-center gap-2"
        >
          {loading && (
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
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
          {mode === "create" ? "Create Trip" : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-camp-earth hover:text-white py-2.5 px-4 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
