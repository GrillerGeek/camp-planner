"use client";

import { Recipe } from "@/lib/types/meals";

interface RecipeDetailsProps {
  recipe: Recipe;
  compact?: boolean;
}

export function RecipeDetails({ recipe, compact = false }: RecipeDetailsProps) {
  const totalTime =
    (recipe.prep_time_minutes ?? 0) + (recipe.cook_time_minutes ?? 0);

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {recipe.description && !compact && (
        <p className="text-camp-earth/80 text-sm">{recipe.description}</p>
      )}

      {/* Time + servings row */}
      <div className="flex items-center gap-3 text-xs text-camp-earth/70 flex-wrap">
        {recipe.prep_time_minutes != null && (
          <span>
            <span className="text-camp-earth/80">{recipe.prep_time_minutes}m</span> prep
          </span>
        )}
        {recipe.cook_time_minutes != null && (
          <span>
            <span className="text-camp-earth/80">{recipe.cook_time_minutes}m</span> cook
          </span>
        )}
        {totalTime > 0 && (
          <span>
            <span className="text-camp-earth/80">{totalTime}m</span> total
          </span>
        )}
        <span>
          Serves <span className="text-camp-earth/80">{recipe.servings}</span>
        </span>
      </div>

      {recipe.tags?.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {recipe.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-camp-forest/20 text-camp-forest"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {recipe.ingredients?.length > 0 && (
        <div>
          <h4 className="text-camp-earth text-xs uppercase tracking-wider mb-1.5">
            Ingredients
          </h4>
          <ul className="space-y-0.5">
            {recipe.ingredients.map((ing, i) => (
              <li key={i} className="text-white/90 text-sm">
                {ing.quantity && (
                  <span className="text-camp-earth/80">
                    {ing.quantity}
                    {ing.unit ? ` ${ing.unit}` : ""}{" "}
                  </span>
                )}
                {ing.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recipe.instructions && (
        <div>
          <h4 className="text-camp-earth text-xs uppercase tracking-wider mb-1.5">
            Instructions
          </h4>
          <p className="text-white/90 text-sm whitespace-pre-wrap">
            {recipe.instructions}
          </p>
        </div>
      )}
    </div>
  );
}
