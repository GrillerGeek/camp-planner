"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteTaskTemplate } from "@/lib/queries/tasks";

interface DeleteTaskTemplateButtonProps {
  templateId: string;
}

export function DeleteTaskTemplateButton({
  templateId,
}: DeleteTaskTemplateButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    try {
      const supabase = createClient();
      await deleteTaskTemplate(supabase, templateId);
      router.refresh();
    } catch {
      // ignore
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={handleDelete}
          className="text-red-400 hover:text-red-300 text-xs font-medium transition-colors"
        >
          Confirm
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-camp-earth hover:text-white text-xs transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-camp-earth/40 hover:text-red-400 transition-colors"
      title="Delete template"
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
          d="M6 18 18 6M6 6l12 12"
        />
      </svg>
    </button>
  );
}
