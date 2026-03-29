"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  createTaskTemplate,
  updateTaskTemplate,
} from "@/lib/queries/tasks";
import { TaskTemplate } from "@/lib/types/tasks";

interface TaskTemplateFormProps {
  mode: "create" | "edit";
  initialData?: TaskTemplate;
}

export function TaskTemplateForm({ mode, initialData }: TaskTemplateFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: initialData?.name ?? "",
    description: initialData?.description ?? "",
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
        const template = await createTaskTemplate(supabase, {
          name: form.name,
          description: form.description,
        });
        router.push(`/dashboard/task-templates/${template.id}/edit`);
      } else if (initialData) {
        await updateTaskTemplate(supabase, initialData.id, {
          name: form.name,
          description: form.description,
        });
        router.push("/dashboard/task-templates");
      }
    } catch {
      setErrors({ form: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
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
            placeholder="e.g., Pre-Trip Checklist"
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
