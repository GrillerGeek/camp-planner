export interface Ingredient {
  name: string;
  quantity: string;
  unit: string;
}

export interface Recipe {
  id: string;
  name: string;
  description: string | null;
  ingredients: Ingredient[];
  instructions: string | null;
  servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  tags: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RecipeFormData {
  name: string;
  description: string;
  ingredients: Ingredient[];
  instructions: string;
  servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  tags: string[];
}

export interface TripMealPlan {
  id: string;
  trip_id: string;
  created_at: string;
}

export interface TripMeal {
  id: string;
  meal_plan_id: string;
  day_date: string;
  meal_type: MealType;
  recipe_id: string | null;
  custom_meal_name: string | null;
  notes: string | null;
  sort_order: number;
  recipes?: Recipe | null;
}

export interface TripMealPlanWithMeals extends TripMealPlan {
  trip_meals: TripMeal[];
}

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_TYPES: MealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
];

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export const RECIPE_TAGS = [
  "campfire",
  "no-cook",
  "one-pot",
  "grill",
  "quick",
  "make-ahead",
  "kid-friendly",
  "vegetarian",
  "gluten-free",
  "dairy-free",
] as const;
