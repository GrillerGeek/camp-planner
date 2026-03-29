import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getRecipes } from "@/lib/queries/meals";

export default async function RecipesPage() {
  const supabase = await createClient();
  const recipes = await getRecipes(supabase);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Recipe Library</h1>
          <p className="text-camp-earth text-sm">
            {recipes.length} {recipes.length === 1 ? "recipe" : "recipes"} saved
          </p>
        </div>
        <Link
          href="/dashboard/recipes/new"
          className="bg-camp-forest hover:bg-camp-pine text-white font-medium py-2.5 px-5 rounded-lg transition-colors flex items-center gap-2"
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
          New Recipe
        </Link>
      </div>

      {recipes.length === 0 ? (
        <div className="text-center py-16 bg-white/5 border border-white/10 rounded-xl">
          <div className="text-5xl mb-4">📖</div>
          <h2 className="text-xl font-semibold text-white mb-2">
            No recipes yet
          </h2>
          <p className="text-camp-earth mb-6">
            Start building your camp recipe collection.
          </p>
          <Link
            href="/dashboard/recipes/new"
            className="inline-block bg-camp-forest hover:bg-camp-pine text-white font-medium py-2.5 px-5 rounded-lg transition-colors"
          >
            Create your first recipe
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recipes.map((recipe) => (
            <Link
              key={recipe.id}
              href={`/dashboard/recipes/${recipe.id}/edit`}
              className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-white/20 transition-colors block"
            >
              <h3 className="text-white font-medium mb-1 truncate">
                {recipe.name}
              </h3>
              {recipe.description && (
                <p className="text-camp-earth text-sm mb-3 line-clamp-2">
                  {recipe.description}
                </p>
              )}
              <div className="flex items-center gap-3 text-camp-earth/60 text-xs">
                {recipe.servings && (
                  <span>
                    {recipe.servings}{" "}
                    {recipe.servings === 1 ? "serving" : "servings"}
                  </span>
                )}
                {recipe.prep_time_minutes && (
                  <span>{recipe.prep_time_minutes}m prep</span>
                )}
                {recipe.cook_time_minutes && (
                  <span>{recipe.cook_time_minutes}m cook</span>
                )}
              </div>
              {recipe.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {recipe.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-full text-xs bg-camp-forest/20 text-camp-forest"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
