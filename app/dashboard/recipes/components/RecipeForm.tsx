"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createRecipe, updateRecipe } from "@/lib/queries/meals";
import { Recipe, RecipeFormData, Ingredient, RECIPE_TAGS } from "@/lib/types/meals";

interface RecipeFormProps {
  recipe?: Recipe;
}

const emptyIngredient: Ingredient = { name: "", quantity: "", unit: "" };

export function RecipeForm({ recipe }: RecipeFormProps) {
  const router = useRouter();
  const isEditing = !!recipe;

  const [formData, setFormData] = useState<RecipeFormData>({
    name: recipe?.name ?? "",
    description: recipe?.description ?? "",
    ingredients: recipe?.ingredients?.length
      ? recipe.ingredients
      : [{ ...emptyIngredient }],
    instructions: recipe?.instructions ?? "",
    servings: recipe?.servings ?? 1,
    prep_time_minutes: recipe?.prep_time_minutes ?? null,
    cook_time_minutes: recipe?.cook_time_minutes ?? null,
    tags: recipe?.tags ?? [],
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addIngredient() {
    setFormData((prev) => ({
      ...prev,
      ingredients: [...prev.ingredients, { ...emptyIngredient }],
    }));
  }

  function removeIngredient(index: number) {
    setFormData((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index),
    }));
  }

  function updateIngredient(
    index: number,
    field: keyof Ingredient,
    value: string
  ) {
    setFormData((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((ing, i) =>
        i === index ? { ...ing, [field]: value } : ing
      ),
    }));
  }

  function toggleTag(tag: string) {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter((t) => t !== tag)
        : [...prev.tags, tag],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError("Recipe name is required.");
      return;
    }

    // Filter out empty ingredients
    const filteredIngredients = formData.ingredients.filter(
      (ing) => ing.name.trim() !== ""
    );

    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        name: formData.name,
        description: formData.description,
        ingredients: filteredIngredients,
        instructions: formData.instructions,
        servings: formData.servings,
        prep_time_minutes: formData.prep_time_minutes,
        cook_time_minutes: formData.cook_time_minutes,
        tags: formData.tags,
      };

      if (isEditing && recipe) {
        await updateRecipe(supabase, recipe.id, payload);
      } else {
        await createRecipe(supabase, payload);
      }

      router.push("/dashboard/recipes");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save recipe.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-white mb-1.5">
          Recipe Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, name: e.target.value }))
          }
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder:text-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest/50 focus:border-camp-forest"
          placeholder="e.g., Campfire Chili"
          required
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-white mb-1.5">
          Description
        </label>
        <textarea
          value={formData.description}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, description: e.target.value }))
          }
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder:text-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest/50 focus:border-camp-forest min-h-[80px]"
          placeholder="A brief description of the recipe..."
          rows={2}
        />
      </div>

      {/* Ingredients */}
      <div>
        <label className="block text-sm font-medium text-white mb-1.5">
          Ingredients
        </label>
        <div className="space-y-2">
          {formData.ingredients.map((ing, index) => (
            <div key={index} className="flex gap-2 items-start">
              <input
                type="text"
                value={ing.name}
                onChange={(e) =>
                  updateIngredient(index, "name", e.target.value)
                }
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest/50"
                placeholder="Ingredient name"
              />
              <input
                type="text"
                value={ing.quantity}
                onChange={(e) =>
                  updateIngredient(index, "quantity", e.target.value)
                }
                className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest/50"
                placeholder="Qty"
              />
              <input
                type="text"
                value={ing.unit}
                onChange={(e) =>
                  updateIngredient(index, "unit", e.target.value)
                }
                className="w-24 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest/50"
                placeholder="Unit"
              />
              <button
                type="button"
                onClick={() => removeIngredient(index)}
                className="text-camp-earth/60 hover:text-red-400 transition-colors p-2"
                title="Remove ingredient"
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
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addIngredient}
          className="mt-2 text-camp-forest hover:text-camp-pine text-sm font-medium transition-colors flex items-center gap-1"
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
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          Add ingredient
        </button>
      </div>

      {/* Instructions */}
      <div>
        <label className="block text-sm font-medium text-white mb-1.5">
          Instructions
        </label>
        <textarea
          value={formData.instructions}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, instructions: e.target.value }))
          }
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder:text-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest/50 focus:border-camp-forest min-h-[120px]"
          placeholder="Step-by-step instructions..."
          rows={4}
        />
      </div>

      {/* Servings, Prep Time, Cook Time */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-white mb-1.5">
            Servings
          </label>
          <input
            type="number"
            min={1}
            value={formData.servings}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                servings: parseInt(e.target.value) || 1,
              }))
            }
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-camp-forest/50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-white mb-1.5">
            Prep Time (min)
          </label>
          <input
            type="number"
            min={0}
            value={formData.prep_time_minutes ?? ""}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                prep_time_minutes: e.target.value
                  ? parseInt(e.target.value)
                  : null,
              }))
            }
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder:text-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest/50"
            placeholder="--"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-white mb-1.5">
            Cook Time (min)
          </label>
          <input
            type="number"
            min={0}
            value={formData.cook_time_minutes ?? ""}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                cook_time_minutes: e.target.value
                  ? parseInt(e.target.value)
                  : null,
              }))
            }
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder:text-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest/50"
            placeholder="--"
          />
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-white mb-1.5">
          Tags
        </label>
        <div className="flex flex-wrap gap-2">
          {RECIPE_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                formData.tags.includes(tag)
                  ? "bg-camp-forest text-white"
                  : "bg-white/5 text-camp-earth border border-white/10 hover:border-white/20"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-camp-forest hover:bg-camp-pine text-white font-medium py-2.5 px-6 rounded-lg transition-colors disabled:opacity-50"
        >
          {saving
            ? "Saving..."
            : isEditing
            ? "Update Recipe"
            : "Create Recipe"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="bg-white/5 hover:bg-white/10 text-white font-medium py-2.5 px-6 rounded-lg transition-colors border border-white/10"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
