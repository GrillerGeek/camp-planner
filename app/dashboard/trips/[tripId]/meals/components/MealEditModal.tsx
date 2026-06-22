"use client";

import { useEffect, useState } from "react";
import { useIsOffline } from "@/app/pwa/OfflineContext";
import {
  Recipe,
  RecipeSnapshot,
  TripMeal,
  MEAL_TYPE_LABELS,
} from "@/lib/types/meals";
import { Trip } from "@/lib/types/trip";
import { RecipeDetails } from "./RecipeDetails";

interface MealEditModalProps {
  meal: TripMeal;
  recipes: Recipe[];
  isPlanner: boolean;
  saving: boolean;
  trip: Trip;
  onClose: () => void;
  onSave: (updates: {
    recipe_id: string | null;
    custom_meal_name: string | null;
    notes: string | null;
  }) => Promise<void>;
}

/** Cast a RecipeSnapshot to the subset of Recipe fields that RecipeDetails reads. */
function snapshotAsRecipe(snapshot: RecipeSnapshot): Recipe {
  return {
    // RecipeDetails only accesses the display fields; we supply safe defaults
    // for the database-identity fields that are not stored in the snapshot.
    id: "",
    created_by: "",
    created_at: snapshot.snapshot_at,
    updated_at: snapshot.snapshot_at,
    name: snapshot.name,
    description: snapshot.description,
    ingredients: snapshot.ingredients,
    instructions: snapshot.instructions,
    servings: snapshot.servings,
    prep_time_minutes: snapshot.prep_time_minutes,
    cook_time_minutes: snapshot.cook_time_minutes,
    tags: snapshot.tags,
  };
}

export function MealEditModal({
  meal,
  recipes,
  isPlanner,
  saving,
  trip,
  onClose,
  onSave,
}: MealEditModalProps) {
  const initialRecipeId = meal.recipe_id;
  const initialCustomName = meal.custom_meal_name ?? "";
  const initialNotes = meal.notes ?? "";

  const isCompleted = trip.status === "completed";
  const isOffline = useIsOffline();

  const [recipeId, setRecipeId] = useState<string | null>(initialRecipeId);
  const [customName, setCustomName] = useState(initialCustomName);
  const [notes, setNotes] = useState(initialNotes);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [pickingRecipe, setPickingRecipe] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // For completed trips prefer the snapshot (history is frozen).
  // For non-completed trips, or when no snapshot exists, fall back to the live
  // recipe. The live lookup still uses recipeId from local state so that a
  // planner who picks a new recipe (on a non-completed trip) sees it immediately.
  const selectedRecipe: Recipe | null = (() => {
    if (isCompleted && meal.recipe_snapshot) {
      return snapshotAsRecipe(meal.recipe_snapshot);
    }
    return recipeId
      ? recipes.find((r) => r.id === recipeId) ?? meal.recipes ?? null
      : null;
  })();

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
    setSaveError(null);
  }

  function handlePickRecipe(r: Recipe) {
    setRecipeId(r.id);
    setCustomName("");
    setPickingRecipe(false);
    setRecipeSearch("");
    setSaveError(null);
  }

  async function handleSubmit() {
    if (!canSave) return;
    try {
      await onSave({
        recipe_id: recipeId,
        custom_meal_name: recipeId ? null : customName.trim() || null,
        notes: notes.trim() || null,
      });
    } catch {
      if (!navigator.onLine) {
        setSaveError(
          "You're offline — your changes weren't saved. Try again when you're back online."
        );
      } else {
        setSaveError("Couldn't save your changes. Please try again.");
      }
    }
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
            className="text-camp-earth/70 hover:text-white text-2xl leading-none p-1 -mr-1 disabled:opacity-50"
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
                onChange={(e) => { setCustomName(e.target.value); setSaveError(null); }}
                placeholder="Meal name..."
                className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-white text-sm placeholder:text-camp-earth/70 focus:outline-none focus:ring-1 focus:ring-camp-forest/50"
              />
            </div>
          )}

          {!pickingRecipe && !selectedRecipe && !isPlanner && (
            <p className="text-camp-earth/80 text-sm">{customName || "(no name)"}</p>
          )}

          {/* Notes */}
          {isPlanner ? (
            <div>
              <label className="block text-camp-earth text-xs uppercase tracking-wider mb-1.5">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setSaveError(null); }}
                placeholder="Notes (optional)..."
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-white text-sm placeholder:text-camp-earth/70 focus:outline-none focus:ring-1 focus:ring-camp-forest/50 resize-none"
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
                className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-white text-sm placeholder:text-camp-earth/70 focus:outline-none focus:ring-1 focus:ring-camp-forest/50"
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {filteredRecipes.length === 0 ? (
                  <p className="text-camp-earth/70 text-xs py-2 text-center">
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
                        <span className="text-camp-earth/70 text-xs ml-2">
                          {r.prep_time_minutes}m prep
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
              <button
                onClick={() => setPickingRecipe(false)}
                className="text-camp-earth/70 hover:text-white text-xs"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Save error banner */}
        {saveError && (
          <div className="mx-5 mb-3 px-3 py-2 bg-camp-fire/10 border border-camp-fire/30 rounded text-camp-fire text-xs">
            {saveError}
          </div>
        )}

        {/* Footer */}
        {isPlanner && !pickingRecipe && (
          <div className="px-5 py-3 border-t border-white/10 flex items-center gap-2 flex-wrap">
            {selectedRecipe ? (
              <>
                <button
                  onClick={() => setPickingRecipe(true)}
                  disabled={saving || isCompleted || isOffline}
                  title={
                    isCompleted
                      ? "Completed trips show the recipe as it was at assignment time."
                      : isOffline
                      ? "Connect to the internet to edit"
                      : undefined
                  }
                  className="bg-white/5 hover:bg-white/10 text-white text-xs font-medium py-1.5 px-3 rounded border border-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Swap recipe
                </button>
                {!isCompleted && (
                  <button
                    onClick={handleClearRecipe}
                    disabled={saving || isOffline}
                    title={isOffline ? "Connect to the internet to edit" : undefined}
                    className="text-camp-earth/70 hover:text-white text-xs py-1.5 px-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Use custom name
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={() => setPickingRecipe(true)}
                disabled={saving || isCompleted || isOffline}
                title={
                  isCompleted
                    ? "Completed trips show the recipe as it was at assignment time."
                    : isOffline
                    ? "Connect to the internet to edit"
                    : undefined
                }
                className="bg-white/5 hover:bg-white/10 text-white text-xs font-medium py-1.5 px-3 rounded border border-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Attach a recipe
              </button>
            )}

            <div className="ml-auto flex gap-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="text-camp-earth/70 hover:text-white text-xs py-1.5 px-3 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSave || isOffline}
                title={isOffline ? "Connect to the internet to save" : undefined}
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
