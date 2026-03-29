"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createTemplate, updateTemplate } from "@/lib/queries/packing";
import {
  PackingTemplate,
  PackingTemplateFormData,
  SEASONS,
  TRIP_TYPES,
} from "@/lib/types/packing";

interface TemplateFormProps {
  mode: "create" | "edit";
  initialData?: PackingTemplate;
}

export function TemplateForm({ mode, initialData }: TemplateFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState<PackingTemplateFormData>({
    name: initialData?.name ?? "",
    description: initialData?.description ?? "",
    seasons: initialData?.seasons ?? [],
    trip_types: initialData?.trip_types ?? [],
  });

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) newErrors.name = "Template name is required";
    else if (form.name.trim().length > 200)
      newErrors.name = "Name must be 200 characters or less";
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
        const template = await createTemplate(supabase, {
          name: form.name,
          description: form.description,
          seasons: form.seasons,
          trip_types: form.trip_types,
        });
        router.push(`/dashboard/templates/${template.id}/edit`);
      } else if (initialData) {
        await updateTemplate(supabase, initialData.id, {
          name: form.name,
          description: form.description,
          seasons: form.seasons,
          trip_types: form.trip_types,
        });
        router.push("/dashboard/templates");
      }
    } catch {
      setErrors({ form: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  function toggleTag(
    field: "seasons" | "trip_types",
    value: string
  ) {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((v) => v !== value)
        : [...prev[field], value],
    }));
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
            Template Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => {
              setForm((prev) => ({ ...prev, name: e.target.value }));
              if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
            }}
            placeholder="e.g., Summer Car Camping Essentials"
            maxLength={200}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
          />
          {errors.name && (
            <p className="text-red-400 text-xs mt-1">{errors.name}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-1.5">
            Description
          </label>
          <textarea
            value={form.description}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder="What is this template for?"
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-2">
            Seasons
          </label>
          <div className="flex flex-wrap gap-2">
            {SEASONS.map((season) => (
              <button
                key={season}
                type="button"
                onClick={() => toggleTag("seasons", season)}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                  form.seasons.includes(season)
                    ? "bg-camp-sky/20 border-camp-sky text-camp-sky"
                    : "border-white/10 text-camp-earth hover:border-white/20"
                }`}
              >
                {season}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-2">
            Trip Types
          </label>
          <div className="flex flex-wrap gap-2">
            {TRIP_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => toggleTag("trip_types", type)}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                  form.trip_types.includes(type)
                    ? "bg-camp-fire/20 border-camp-fire text-camp-fire"
                    : "border-white/10 text-camp-earth hover:border-white/20"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
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
          {mode === "create" ? "Create Template" : "Save Changes"}
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
