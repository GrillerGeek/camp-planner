"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getOrCreateTripMealPlan,
  addMeal,
  updateMeal,
  removeMeal,
  getAISuggestions,
} from "@/lib/queries/meals";
import { Trip } from "@/lib/types/trip";
import {
  Recipe,
  TripMeal,
  TripMealPlanWithMeals,
  MealType,
  MEAL_TYPES,
  MEAL_TYPE_LABELS,
} from "@/lib/types/meals";

interface MealPlannerClientProps {
  tripId: string;
  trip: Trip;
  isPlanner: boolean;
  initialMealPlan: TripMealPlanWithMeals | null;
  recipes: Recipe[];
}

function getTripDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const current = new Date(start);
  while (current <= end) {
    days.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function formatDayLabel(dateStr: string, index: number): string {
  const date = new Date(dateStr + "T00:00:00");
  const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
  const monthDay = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `Day ${index + 1} - ${dayName}, ${monthDay}`;
}

export function MealPlannerClient({
  tripId,
  trip,
  isPlanner,
  initialMealPlan,
  recipes,
}: MealPlannerClientProps) {
  const [mealPlan, setMealPlan] = useState(initialMealPlan);
  const [meals, setMeals] = useState<TripMeal[]>(
    initialMealPlan?.trip_meals ?? []
  );
  const [activeSlot, setActiveSlot] = useState<{
    dayDate: string;
    mealType: MealType;
  } | null>(null);
  const [showRecipePicker, setShowRecipePicker] = useState(false);
  const [customMealName, setCustomMealName] = useState("");
  const [mealNotes, setMealNotes] = useState("");
  const [recipeSearch, setRecipeSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [showSuggestionToast, setShowSuggestionToast] = useState(false);

  const tripDays = getTripDays(trip.start_date, trip.end_date);

  const getMealsForSlot = useCallback(
    (dayDate: string, mealType: MealType): TripMeal[] => {
      return meals.filter(
        (m) => m.day_date === dayDate && m.meal_type === mealType
      );
    },
    [meals]
  );

  const getMealDisplayName = (meal: TripMeal): string => {
    if (meal.custom_meal_name) return meal.custom_meal_name;
    if (meal.recipes) return meal.recipes.name;
    return "Unnamed meal";
  };

  async function ensureMealPlan(): Promise<string> {
    if (mealPlan) return mealPlan.id;

    const supabase = createClient();
    const plan = await getOrCreateTripMealPlan(supabase, tripId);
    setMealPlan({
      ...plan,
      trip_meals: [],
    });
    return plan.id;
  }

  async function handleAddMeal(recipe?: Recipe) {
    if (!activeSlot || !isPlanner) return;

    const name = recipe ? null : customMealName.trim();
    if (!recipe && !name) return;

    setSaving(true);
    try {
      const mealPlanId = await ensureMealPlan();
      const supabase = createClient();

      const newMeal = await addMeal(supabase, {
        meal_plan_id: mealPlanId,
        day_date: activeSlot.dayDate,
        meal_type: activeSlot.mealType,
        recipe_id: recipe?.id ?? null,
        custom_meal_name: recipe ? null : name,
        notes: mealNotes.trim() || undefined,
        sort_order: getMealsForSlot(activeSlot.dayDate, activeSlot.mealType)
          .length,
      });

      setMeals((prev) => [...prev, newMeal]);
      closeSlotEditor();
    } catch (err) {
      console.error("Failed to add meal:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveMeal(mealId: string) {
    if (!isPlanner) return;

    try {
      const supabase = createClient();
      await removeMeal(supabase, mealId);
      setMeals((prev) => prev.filter((m) => m.id !== mealId));
    } catch (err) {
      console.error("Failed to remove meal:", err);
    }
  }

  async function handleMoveMeal(
    mealId: string,
    newDayDate: string,
    newMealType: MealType
  ) {
    if (!isPlanner) return;

    try {
      const supabase = createClient();
      const updated = await updateMeal(supabase, mealId, {
        day_date: newDayDate,
        meal_type: newMealType,
      });
      setMeals((prev) => prev.map((m) => (m.id === mealId ? updated : m)));
    } catch (err) {
      console.error("Failed to move meal:", err);
    }
  }

  function openSlotEditor(dayDate: string, mealType: MealType) {
    if (!isPlanner) return;
    setActiveSlot({ dayDate, mealType });
    setCustomMealName("");
    setMealNotes("");
    setRecipeSearch("");
    setShowRecipePicker(false);
  }

  function closeSlotEditor() {
    setActiveSlot(null);
    setCustomMealName("");
    setMealNotes("");
    setRecipeSearch("");
    setShowRecipePicker(false);
  }

  function handleGetSuggestions() {
    // Stub: show "coming soon" toast
    getAISuggestions(tripId);
    setShowSuggestionToast(true);
    setTimeout(() => setShowSuggestionToast(false), 3000);
  }

  const filteredRecipes = recipes.filter((r) =>
    r.name.toLowerCase().includes(recipeSearch.toLowerCase())
  );

  // Drag and drop handlers
  function handleDragStart(
    e: React.DragEvent,
    mealId: string
  ) {
    e.dataTransfer.setData("mealId", mealId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(
    e: React.DragEvent,
    dayDate: string,
    mealType: MealType
  ) {
    e.preventDefault();
    const mealId = e.dataTransfer.getData("mealId");
    if (mealId) {
      handleMoveMeal(mealId, dayDate, mealType);
    }
  }

  return (
    <div>
      {/* AI Suggestions button */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={handleGetSuggestions}
          className="bg-camp-fire/20 hover:bg-camp-fire/30 text-camp-fire font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2 text-sm border border-camp-fire/30"
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
              d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z"
            />
          </svg>
          Get Suggestions
        </button>
        {showSuggestionToast && (
          <span className="text-camp-earth text-sm animate-pulse">
            Coming soon - AI meal suggestions are under development
          </span>
        )}
      </div>

      {/* Meal planner grid */}
      <div className="space-y-3">
        {tripDays.map((dayDate, dayIndex) => (
          <div
            key={dayDate}
            className="bg-white/5 border border-white/10 rounded-xl overflow-hidden"
          >
            {/* Day header */}
            <div className="px-4 py-3 border-b border-white/10 bg-white/5">
              <h3 className="text-white font-medium text-sm">
                {formatDayLabel(dayDate, dayIndex)}
              </h3>
            </div>

            {/* Meal type columns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/10">
              {MEAL_TYPES.map((mealType) => {
                const slotMeals = getMealsForSlot(dayDate, mealType);
                const isActive =
                  activeSlot?.dayDate === dayDate &&
                  activeSlot?.mealType === mealType;

                return (
                  <div
                    key={mealType}
                    className="p-3 min-h-[100px]"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, dayDate, mealType)}
                  >
                    <div className="text-camp-earth/60 text-xs font-medium uppercase tracking-wider mb-2">
                      {MEAL_TYPE_LABELS[mealType]}
                    </div>

                    {/* Existing meals */}
                    {slotMeals.map((meal) => (
                      <div
                        key={meal.id}
                        draggable={isPlanner}
                        onDragStart={(e) => handleDragStart(e, meal.id)}
                        className="bg-white/5 border border-white/10 rounded-lg p-2 mb-2 group cursor-move"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="text-white text-sm font-medium truncate">
                            {getMealDisplayName(meal)}
                          </span>
                          {isPlanner && (
                            <button
                              onClick={() => handleRemoveMeal(meal.id)}
                              className="text-camp-earth/40 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                              title="Remove meal"
                            >
                              <svg
                                className="w-3.5 h-3.5"
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
                          )}
                        </div>
                        {meal.notes && (
                          <p className="text-camp-earth/60 text-xs mt-1 truncate">
                            {meal.notes}
                          </p>
                        )}
                        {meal.recipes?.tags && meal.recipes.tags.length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {meal.recipes.tags.slice(0, 2).map((tag) => (
                              <span
                                key={tag}
                                className="text-[10px] px-1.5 py-0.5 rounded-full bg-camp-forest/20 text-camp-forest"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Add meal button or editor */}
                    {isActive ? (
                      <div className="bg-white/5 border border-camp-forest/30 rounded-lg p-3 space-y-3">
                        {!showRecipePicker ? (
                          <>
                            <input
                              type="text"
                              value={customMealName}
                              onChange={(e) =>
                                setCustomMealName(e.target.value)
                              }
                              placeholder="Meal name..."
                              className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-white text-sm placeholder:text-camp-earth/50 focus:outline-none focus:ring-1 focus:ring-camp-forest/50"
                              autoFocus
                            />
                            <input
                              type="text"
                              value={mealNotes}
                              onChange={(e) => setMealNotes(e.target.value)}
                              placeholder="Notes (optional)..."
                              className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-white text-sm placeholder:text-camp-earth/50 focus:outline-none focus:ring-1 focus:ring-camp-forest/50"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleAddMeal()}
                                disabled={
                                  saving || !customMealName.trim()
                                }
                                className="bg-camp-forest hover:bg-camp-pine text-white text-xs font-medium py-1.5 px-3 rounded transition-colors disabled:opacity-50"
                              >
                                {saving ? "Adding..." : "Add"}
                              </button>
                              <button
                                onClick={() => setShowRecipePicker(true)}
                                className="bg-white/5 hover:bg-white/10 text-white text-xs font-medium py-1.5 px-3 rounded transition-colors border border-white/10"
                              >
                                From Recipe
                              </button>
                              <button
                                onClick={closeSlotEditor}
                                className="text-camp-earth/60 hover:text-white text-xs py-1.5 px-2 transition-colors ml-auto"
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <input
                              type="text"
                              value={recipeSearch}
                              onChange={(e) =>
                                setRecipeSearch(e.target.value)
                              }
                              placeholder="Search recipes..."
                              className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-white text-sm placeholder:text-camp-earth/50 focus:outline-none focus:ring-1 focus:ring-camp-forest/50"
                              autoFocus
                            />
                            <div className="max-h-40 overflow-y-auto space-y-1">
                              {filteredRecipes.length === 0 ? (
                                <p className="text-camp-earth/60 text-xs py-2 text-center">
                                  No recipes found
                                </p>
                              ) : (
                                filteredRecipes.map((recipe) => (
                                  <button
                                    key={recipe.id}
                                    onClick={() => handleAddMeal(recipe)}
                                    disabled={saving}
                                    className="w-full text-left bg-white/5 hover:bg-white/10 border border-white/10 rounded px-2.5 py-1.5 text-sm text-white transition-colors disabled:opacity-50"
                                  >
                                    <span className="font-medium">
                                      {recipe.name}
                                    </span>
                                    {recipe.prep_time_minutes && (
                                      <span className="text-camp-earth/60 text-xs ml-2">
                                        {recipe.prep_time_minutes}m prep
                                      </span>
                                    )}
                                  </button>
                                ))
                              )}
                            </div>
                            <button
                              onClick={() => setShowRecipePicker(false)}
                              className="text-camp-earth/60 hover:text-white text-xs py-1 transition-colors"
                            >
                              Back to custom entry
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      isPlanner && (
                        <button
                          onClick={() => openSlotEditor(dayDate, mealType)}
                          className="w-full text-center py-2 text-camp-earth/40 hover:text-camp-forest text-xs transition-colors border border-dashed border-white/10 hover:border-camp-forest/30 rounded-lg"
                        >
                          + Add meal
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {tripDays.length === 0 && (
        <div className="text-center py-16 bg-white/5 border border-white/10 rounded-xl">
          <div className="text-5xl mb-4">📅</div>
          <h2 className="text-xl font-semibold text-white mb-2">
            No trip dates set
          </h2>
          <p className="text-camp-earth">
            Set your trip start and end dates to start planning meals.
          </p>
        </div>
      )}
    </div>
  );
}
