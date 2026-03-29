import { SupabaseClient } from "@supabase/supabase-js";
import {
  Recipe,
  TripMealPlan,
  TripMeal,
  TripMealPlanWithMeals,
  MealType,
} from "@/lib/types/meals";

// ============================================================
// RECIPES
// ============================================================

export async function getRecipes(
  supabase: SupabaseClient
): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getRecipeById(
  supabase: SupabaseClient,
  recipeId: string
): Promise<Recipe | null> {
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", recipeId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function createRecipe(
  supabase: SupabaseClient,
  recipe: {
    name: string;
    description?: string;
    ingredients?: { name: string; quantity: string; unit: string }[];
    instructions?: string;
    servings?: number;
    prep_time_minutes?: number | null;
    cook_time_minutes?: number | null;
    tags?: string[];
  }
): Promise<Recipe> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("recipes")
    .insert({
      name: recipe.name.trim(),
      description: recipe.description?.trim() || null,
      ingredients: recipe.ingredients ?? [],
      instructions: recipe.instructions?.trim() || null,
      servings: recipe.servings ?? 1,
      prep_time_minutes: recipe.prep_time_minutes ?? null,
      cook_time_minutes: recipe.cook_time_minutes ?? null,
      tags: recipe.tags ?? [],
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateRecipe(
  supabase: SupabaseClient,
  recipeId: string,
  recipe: {
    name?: string;
    description?: string;
    ingredients?: { name: string; quantity: string; unit: string }[];
    instructions?: string;
    servings?: number;
    prep_time_minutes?: number | null;
    cook_time_minutes?: number | null;
    tags?: string[];
  }
): Promise<Recipe> {
  const updateData: Record<string, unknown> = {};
  if (recipe.name !== undefined) updateData.name = recipe.name.trim();
  if (recipe.description !== undefined)
    updateData.description = recipe.description.trim() || null;
  if (recipe.ingredients !== undefined)
    updateData.ingredients = recipe.ingredients;
  if (recipe.instructions !== undefined)
    updateData.instructions = recipe.instructions.trim() || null;
  if (recipe.servings !== undefined) updateData.servings = recipe.servings;
  if (recipe.prep_time_minutes !== undefined)
    updateData.prep_time_minutes = recipe.prep_time_minutes;
  if (recipe.cook_time_minutes !== undefined)
    updateData.cook_time_minutes = recipe.cook_time_minutes;
  if (recipe.tags !== undefined) updateData.tags = recipe.tags;

  const { data, error } = await supabase
    .from("recipes")
    .update(updateData)
    .eq("id", recipeId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteRecipe(
  supabase: SupabaseClient,
  recipeId: string
): Promise<void> {
  const { error } = await supabase
    .from("recipes")
    .delete()
    .eq("id", recipeId);
  if (error) throw error;
}

// ============================================================
// TRIP MEAL PLANS
// ============================================================

export async function getTripMealPlan(
  supabase: SupabaseClient,
  tripId: string
): Promise<TripMealPlanWithMeals | null> {
  const { data, error } = await supabase
    .from("trip_meal_plans")
    .select("*, trip_meals(*, recipes(*))")
    .eq("trip_id", tripId)
    .order("day_date", {
      referencedTable: "trip_meals",
      ascending: true,
    })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getOrCreateTripMealPlan(
  supabase: SupabaseClient,
  tripId: string
): Promise<TripMealPlan> {
  const { data: existing } = await supabase
    .from("trip_meal_plans")
    .select("*")
    .eq("trip_id", tripId)
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabase
    .from("trip_meal_plans")
    .insert({ trip_id: tripId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function addMeal(
  supabase: SupabaseClient,
  meal: {
    meal_plan_id: string;
    day_date: string;
    meal_type: MealType;
    recipe_id?: string | null;
    custom_meal_name?: string | null;
    notes?: string;
    sort_order?: number;
  }
): Promise<TripMeal> {
  const { data, error } = await supabase
    .from("trip_meals")
    .insert({
      meal_plan_id: meal.meal_plan_id,
      day_date: meal.day_date,
      meal_type: meal.meal_type,
      recipe_id: meal.recipe_id || null,
      custom_meal_name: meal.custom_meal_name?.trim() || null,
      notes: meal.notes?.trim() || null,
      sort_order: meal.sort_order ?? 0,
    })
    .select("*, recipes(*)")
    .single();

  if (error) throw error;
  return data;
}

export async function updateMeal(
  supabase: SupabaseClient,
  mealId: string,
  updates: Partial<{
    day_date: string;
    meal_type: MealType;
    recipe_id: string | null;
    custom_meal_name: string | null;
    notes: string | null;
    sort_order: number;
  }>
): Promise<TripMeal> {
  const { data, error } = await supabase
    .from("trip_meals")
    .update(updates)
    .eq("id", mealId)
    .select("*, recipes(*)")
    .single();

  if (error) throw error;
  return data;
}

export async function removeMeal(
  supabase: SupabaseClient,
  mealId: string
): Promise<void> {
  const { error } = await supabase
    .from("trip_meals")
    .delete()
    .eq("id", mealId);
  if (error) throw error;
}

// ============================================================
// MEAL PROGRESS
// ============================================================

/**
 * Get meal planning progress for a trip.
 * Returns { planned: number, total: number } where total = trip days * 3 (breakfast, lunch, dinner).
 * Snacks are bonus and don't count toward the total.
 */
export async function getMealProgress(
  supabase: SupabaseClient,
  tripId: string
): Promise<{ planned: number; total: number } | null> {
  // Get trip dates to calculate total slots
  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("start_date, end_date")
    .eq("id", tripId)
    .single();

  if (tripError || !trip) return null;

  const start = new Date(trip.start_date);
  const end = new Date(trip.end_date);
  const days = Math.max(
    1,
    Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );
  const totalSlots = days * 3; // breakfast, lunch, dinner per day

  // Get meal plan meals
  const { data: mealPlan } = await supabase
    .from("trip_meal_plans")
    .select("id, trip_meals(id, meal_type)")
    .eq("trip_id", tripId)
    .limit(1)
    .maybeSingle();

  if (!mealPlan) return { planned: 0, total: totalSlots };

  const meals = mealPlan.trip_meals ?? [];
  // Count main meals (not snacks) that are planned
  const planned = meals.filter(
    (m: { meal_type: string }) =>
      m.meal_type === "breakfast" ||
      m.meal_type === "lunch" ||
      m.meal_type === "dinner"
  ).length;

  return { planned, total: totalSlots };
}

// ============================================================
// AI SUGGESTIONS (stub)
// ============================================================

/**
 * Stub function for AI meal suggestions.
 * Returns an empty array for now - will be implemented with Claude API later.
 */
export async function getAISuggestions(
  _tripId: string
): Promise<{ name: string; description: string; source: string }[]> {
  return [];
}
