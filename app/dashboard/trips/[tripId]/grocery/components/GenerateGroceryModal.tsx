"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { bulkAddGroceryItems } from "@/lib/queries/grocery";
import {
  GroceryItem,
  GROCERY_CATEGORIES,
  COMMON_UNITS,
} from "@/lib/types/inventory";
import { proposeGroceryFromMeals } from "../actions";

interface ReviewRow {
  key: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  source: "recipe" | "ai";
  include: boolean; // for non-duplicate rows
  dupAction: "skip" | "merge"; // for duplicate rows
}

interface GenerateGroceryModalProps {
  tripId: string;
  memberCount: number;
  existingItems: GroceryItem[];
  onCommitted: (items: GroceryItem[]) => void;
  onClose: () => void;
  isOffline: boolean;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

export function GenerateGroceryModal({
  tripId,
  memberCount,
  existingItems,
  onCommitted,
  onClose,
  isOffline,
}: GenerateGroceryModalProps) {
  const [phase, setPhase] = useState<"headcount" | "review">("headcount");
  const [headcount, setHeadcount] = useState(Math.max(1, memberCount));
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);

  const supabase = createClient();

  // Find an existing list item matching a review row by (name, unit). Recomputed
  // live so editing a row's name/unit updates its duplicate status.
  function findDuplicate(name: string, unit: string): GroceryItem | undefined {
    return existingItems.find(
      (e) => norm(e.name) === norm(name) && norm(e.unit) === norm(unit)
    );
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    const result = await proposeGroceryFromMeals(tripId, headcount);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRows(
      result.items.map((it, i) => ({
        key: `prop-${i}`,
        name: it.name,
        quantity: it.quantity,
        unit: it.unit ?? "",
        category: it.category,
        source: it.source,
        include: true,
        dupAction: "skip",
      }))
    );
    setPhase("review");
  }

  function updateRow(key: string, patch: Partial<ReviewRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  // Derive the commit sets from current rows + live duplicate detection.
  const { toInsert, toMerge, addCount } = useMemo(() => {
    const inserts: {
      name: string;
      quantity: number;
      unit: string | null;
      category: string;
    }[] = [];
    const merges: { id: string; addQuantity: number }[] = [];
    for (const r of rows) {
      const dup = findDuplicate(r.name, r.unit);
      if (dup) {
        if (r.dupAction === "merge") {
          merges.push({ id: dup.id, addQuantity: r.quantity });
        }
      } else if (r.include) {
        inserts.push({
          name: r.name,
          quantity: r.quantity,
          unit: r.unit || null,
          category: r.category,
        });
      }
    }
    return {
      toInsert: inserts,
      toMerge: merges,
      addCount: inserts.length + merges.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, existingItems]);

  async function handleCommit() {
    if (addCount === 0 || isOffline) return;
    setCommitting(true);
    setError(null);
    try {
      const committed = await bulkAddGroceryItems(supabase, tripId, {
        toInsert,
        toMerge,
      });
      onCommitted(committed);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't add the items. Try again."
      );
      setCommitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-camp-night border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            🧾 Generate grocery list from meals
          </h2>
          <button
            onClick={onClose}
            className="text-camp-earth hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm m-5 mb-0 rounded-lg p-3">
            {error}
          </div>
        )}

        {/* Step 1: headcount */}
        {phase === "headcount" && (
          <div className="p-5">
            <p className="text-camp-earth text-sm mb-4">
              We&apos;ll build a draft from your meals — exact ingredients for any
              recipe-linked meals, and AI-estimated items for meals planned by
              name. How many people are you cooking for?
            </p>
            <label className="block text-sm text-white mb-1">Cooking for</label>
            <div className="flex items-center gap-2 mb-1">
              <input
                type="number"
                min={1}
                value={headcount}
                onChange={(e) =>
                  setHeadcount(Math.max(1, parseInt(e.target.value, 10) || 1))
                }
                className="w-24 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-camp-forest"
              />
              <span className="text-camp-earth text-sm">people</span>
            </div>
            <p className="text-camp-earth/60 text-xs">
              Defaulted to this trip&apos;s {memberCount} member
              {memberCount === 1 ? "" : "s"} — adjust if your group is bigger.
              Used to scale quantities for name-only meals.
            </p>
          </div>
        )}

        {/* Step 2: review */}
        {phase === "review" && (
          <div className="p-5 overflow-y-auto">
            <p className="text-camp-earth text-sm mb-4">
              Review the draft. Edit anything, uncheck what you don&apos;t need.
              Items already on your list are flagged.
            </p>
            <div className="space-y-2">
              {rows.map((r) => {
                const dup = findDuplicate(r.name, r.unit);
                return (
                  <div
                    key={r.key}
                    className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 ${
                      dup ? "bg-camp-fire/10 border border-camp-fire/30" : "bg-white/5"
                    }`}
                  >
                    {!dup && (
                      <input
                        type="checkbox"
                        checked={r.include}
                        onChange={(e) => updateRow(r.key, { include: e.target.checked })}
                        className="w-4 h-4 accent-camp-forest shrink-0"
                      />
                    )}
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                        r.source === "recipe"
                          ? "bg-camp-sky/20 text-camp-sky"
                          : "bg-camp-pine/30 text-camp-earth"
                      }`}
                      title={
                        r.source === "recipe"
                          ? "From a linked recipe"
                          : "AI-estimated from a meal name"
                      }
                    >
                      {r.source === "recipe" ? "recipe" : "AI"}
                    </span>
                    <input
                      type="text"
                      value={r.name}
                      onChange={(e) => updateRow(r.key, { name: e.target.value })}
                      className="flex-1 min-w-[8rem] bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-camp-forest"
                    />
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={r.quantity}
                      onChange={(e) =>
                        updateRow(r.key, { quantity: parseFloat(e.target.value) || 0 })
                      }
                      className="w-16 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white text-center focus:outline-none focus:ring-1 focus:ring-camp-forest"
                    />
                    <select
                      value={r.unit}
                      onChange={(e) => updateRow(r.key, { unit: e.target.value })}
                      className="bg-white/5 border border-white/10 rounded px-1 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-camp-forest"
                    >
                      {COMMON_UNITS.map((u) => (
                        <option key={u} value={u} className="bg-camp-night">
                          {u || "—"}
                        </option>
                      ))}
                    </select>
                    <select
                      value={r.category}
                      onChange={(e) => updateRow(r.key, { category: e.target.value })}
                      className="bg-white/5 border border-white/10 rounded px-1 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-camp-forest"
                    >
                      {GROCERY_CATEGORIES.map((c) => (
                        <option key={c} value={c} className="bg-camp-night">
                          {c}
                        </option>
                      ))}
                    </select>
                    {dup && (
                      <div className="flex items-center gap-1 w-full sm:w-auto">
                        <span className="text-camp-fire text-xs font-medium">on list</span>
                        <select
                          value={r.dupAction}
                          onChange={(e) =>
                            updateRow(r.key, {
                              dupAction: e.target.value as "skip" | "merge",
                            })
                          }
                          className="bg-white/5 border border-white/10 rounded px-1 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-camp-forest"
                        >
                          <option value="skip" className="bg-camp-night">skip</option>
                          <option value="merge" className="bg-camp-night">add qty</option>
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-5 border-t border-white/10">
          <button
            onClick={onClose}
            className="text-camp-earth hover:text-white text-sm py-2 px-4 transition-colors"
          >
            Cancel
          </button>
          {phase === "headcount" ? (
            <button
              onClick={handleGenerate}
              disabled={loading || isOffline}
              className="bg-camp-sky hover:bg-camp-sky/80 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {loading ? "Building draft…" : "Generate draft"}
            </button>
          ) : (
            <button
              onClick={handleCommit}
              disabled={committing || addCount === 0 || isOffline}
              title={isOffline ? "Connect to the internet to add items" : undefined}
              className="bg-camp-forest hover:bg-camp-pine disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {committing ? "Adding…" : `Add ${addCount} item${addCount === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
