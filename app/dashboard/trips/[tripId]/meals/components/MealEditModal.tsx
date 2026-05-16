"use client";

import { useEffect, useState } from "react";
import {
  Recipe,
  TripMeal,
  MEAL_TYPE_LABELS,
} from "@/lib/types/meals";
import { RecipeDetails } from "./RecipeDetails";

interface MealEditModalProps {
  meal: TripMeal;
  recipes: Recipe[];
  isPlanner: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (updates: {
    recipe_id: string | null;
    custom_meal_name: string | null;
    notes: string | null;
  }) => Promise<void>;
}

export function MealEditModal({
  meal,
  recipes,
  isPlanner,
  saving,
  onClose,
  onSave,
}: MealEditModalProps) {
  const initialRecipeId = meal.recipe_id;
  const initialCustomName = meal.custom_meal_name ?? "";
  const initialNotes = meal.notes ?? "";

  const [recipeId, setRecipeId] = useState<string | null>(initialRecipeId);
  const [customName, setCustomName] = useState(initialCustomName);
  const [notes, setNotes] = useState(initialNotes);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [pickingRecipe, setPickingRecipe] = useState(false);

  const selectedRecipe = recipeId
    ? recipes.find((r) => r.id === recipeId) ?? meal.recipes ?? null
    : null;

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const filteredRecipes = recipes.filter((r) =>
    r.name.toLowerCase().includes(recipeSearch.toLowerCase())
  );

  const dirty =
    recipeId !== initialRecipeId ||
    customName !== initialCustomName ||
    notes !== initialNotes;

  const canSave =
    dirty && (recipeId !== null || customName.trim().length > 0) && !saving;

  function handleClearRecipe() {
    setRecipeId(null);
    setPickingRecipe(false);
  }

  function handlePickRecipe(r: Recipe) {
    setRecipeId(r.id);
    setCustomName("");
    setPickingRecipe(false);
    setRecipeSearch("");
  }

  async function handleSubmit() {
    if (!canSave) return;
    await onSave({
      recipe_id: recipeId,
      custom_meal_name: recipeId ? null : customName.trim() || null,
      notes: notes.trim() || null,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-y-auto"
      onClick={() => !saving && onClose()}
    >
      <div
        className="bg-camp-night border border-white/10 rounded-xl w-full max-w-2xl my-12 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-camp-fire mb-1">
              {MEAL_TYPE_LABELS[meal.meal_type]} ·{" "}
              {new Date(meal.day_date + "T00:00:00").toLocaleDateString(
                "en-US",
                { weekday: "short", month: "short", day: "numeric" }
              )}
            </div>
            <h2 className="text-white text-lg font-semibold">
              {selectedRecipe?.name ?? customName ?? "Meal"}
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-camp-earth/60 hover:text-white text-2xl leading-none p-1 -mr-1 disabled:opacity-50"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Recipe details OR custom-name editor */}
          {!pickingRecipe && selectedRecipe && (
            <RecipeDetails recipe={selectedRecipe} />
          )}

          {!pickingRecipe && !selectedRecipe && isPlanner && (
            <div>
              <label className="block text-camp-earth text-xs uppercase tracking-wider mb-1.5">
                Meal name
              </label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Meal name..."
                className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-white text-sm placeholder:text-camp-earth/50 focus:outline-none focus:ring-1 focus:ring-camp-forest/50"
              />
            </div>
          )}

          {!pickingRecipe && !selectedRecipe && !isPlanner && (
            <p className="text-camp-earth/70 text-sm">{customName || "(no name)"}</p>
          )}

          {/* Notes */}
          {isPlanner ? (
            <div>
              <label className="block text-camp-earth text-xs uppercase tracking-wider mb-1.5">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)..."
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-white text-sm placeholder:text-camp-earth/50 focus:outline-none focus:ring-1 focus:ring-camp-forest/50 resize-none"
              />
            </div>
          ) : (
            notes && (
              <div>
                <h4 className="text-camp-earth text-xs uppercase tracking-wider mb-1.5">
                  Notes
                </h4>
                <p className="text-white/90 text-sm whitespace-pre-wrap">
                  {notes}
                </p>
              </div>
            )
          )}

          {/* Recipe picker */}
          {pickingRecipe && (
            <div className="space-y-2 border-t border-white/10 pt-4">
              <input
                type="text"
                value={recipeSearch}
                onChange={(e) => setRecipeSearch(e.target.value)}
                placeholder="Search recipes..."
                className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-white text-sm placeholder:text-camp-earth/50 focus:outline-none focus:ring-1 focus:ring-camp-forest/50"
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {filteredRecipes.length === 0 ? (
                  <p className="text-camp-earth/60 text-xs py-2 text-center">
                    No recipes found
                  </p>
                ) : (
                  filteredRecipes.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => handlePickRecipe(r)}
                      className="w-full text-left bg-white/5 hover:bg-white/10 border border-white/10 rounded px-2.5 py-1.5 text-sm text-white transition-colors"
                    >
                      <span className="font-medium">{r.name}</span>
                      {r.prep_time_minutes != null && (
                        <span className="text-camp-earth/60 text-xs ml-2">
                          {r.prep_time_minutes}m prep
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
              <button
                onClick={() => setPickingRecipe(false)}
                className="text-camp-earth/60 hover:text-white text-xs"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {isPlanner && !pickingRecipe && (
          <div className="px-5 py-3 border-t border-white/10 flex items-center gap-2 flex-wrap">
            {selectedRecipe ? (
              <>
                <button
                  onClick={() => setPickingRecipe(true)}
                  disabled={saving}
                  className="bg-white/5 hover:bg-white/10 text-white text-xs font-medium py-1.5 px-3 rounded border border-white/10 transition-colors disabled:opacity-50"
                >
                  Swap recipe
                </button>
                <button
                  onClick={handleClearRecipe}
                  disabled={saving}
                  className="text-camp-earth/60 hover:text-white text-xs py-1.5 px-2 transition-colors disabled:opacity-50"
                >
                  Use custom name
                </button>
              </>
            ) : (
              <button
                onClick={() => setPickingRecipe(true)}
                disabled={saving}
                className="bg-white/5 hover:bg-white/10 text-white text-xs font-medium py-1.5 px-3 rounded border border-white/10 transition-colors disabled:opacity-50"
              >
                Attach a recipe
              </button>
            )}

            <div className="ml-auto flex gap-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="text-camp-earth/60 hover:text-white text-xs py-1.5 px-3 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSave}
                className="bg-camp-forest hover:bg-camp-pine text-white text-xs font-medium py-1.5 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
