"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";

interface RecipesFiltersProps {
  initialQuery: string;
  initialTags: string[];
  availableTags: string[];
}

/**
 * URL-driven filter controls for the recipe library (SPEC-005b.4).
 * Writes the search query and tag set into the URL via useRouter so
 * the Server Component re-fetches with the new params. Search is
 * debounced 250ms so each keystroke doesn't trigger a fetch.
 */
export function RecipesFilters({
  initialQuery,
  initialTags,
  availableTags,
}: RecipesFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [, startTransition] = useTransition();

  // Sync local state when the URL changes externally (e.g., browser back).
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);
  useEffect(() => {
    setTags(initialTags);
  }, [initialTags.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced URL writer for the search input.
  useEffect(() => {
    if (query === initialQuery) return;
    const id = setTimeout(() => {
      pushParams({ q: query, tag: tags });
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function pushParams(next: { q: string; tag: string[] }) {
    const sp = new URLSearchParams();
    if (next.q.trim()) sp.set("q", next.q.trim());
    for (const t of next.tag) sp.append("tag", t);
    // Page resets to 1 whenever filters change.
    const qs = sp.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function toggleTag(tag: string) {
    const next = tags.includes(tag)
      ? tags.filter((t) => t !== tag)
      : [...tags, tag];
    setTags(next);
    pushParams({ q: query, tag: next });
  }

  function clearAll() {
    setQuery("");
    setTags([]);
    startTransition(() => {
      router.replace(pathname);
    });
  }

  const hasFilters = query.trim() !== "" || tags.length > 0;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search recipes by name..."
          className="flex-1 min-w-[200px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-camp-earth/40 focus:outline-none focus:border-camp-forest"
        />
        {hasFilters && (
          <button
            onClick={clearAll}
            className="text-camp-earth hover:text-white text-sm py-2 px-3 rounded-lg hover:bg-white/10 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {availableTags.map((tag) => {
          const active = tags.includes(tag);
          return (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                active
                  ? "bg-camp-forest text-white"
                  : "bg-white/5 text-camp-earth/80 hover:bg-white/10 hover:text-camp-earth"
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
