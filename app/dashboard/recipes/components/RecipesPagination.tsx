"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface RecipesPaginationProps {
  currentPage: number;
  totalPages: number;
}

/**
 * Prev/Next pagination for the recipe library. Writes the `page` URL
 * param via useRouter; preserves any existing q + tag filters.
 */
export function RecipesPagination({
  currentPage,
  totalPages,
}: RecipesPaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function goto(page: number) {
    const sp = new URLSearchParams(params.toString());
    if (page <= 1) {
      sp.delete("page");
    } else {
      sp.set("page", String(page));
    }
    const qs = sp.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  return (
    <div className="flex items-center justify-between mt-8">
      <button
        disabled={!canPrev || pending}
        onClick={() => goto(currentPage - 1)}
        className="px-3 py-1.5 rounded-lg text-sm text-camp-earth hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
      >
        ← Previous
      </button>
      <span className="text-camp-earth/70 text-sm">
        Page {currentPage} of {totalPages}
      </span>
      <button
        disabled={!canNext || pending}
        onClick={() => goto(currentPage + 1)}
        className="px-3 py-1.5 rounded-lg text-sm text-camp-earth hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
      >
        Next →
      </button>
    </div>
  );
}
