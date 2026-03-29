import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getRecipeById } from "@/lib/queries/meals";
import { RecipeForm } from "../../components/RecipeForm";
import { RecipeDeleteButton } from "./RecipeDeleteButton";

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  const supabase = await createClient();
  const recipe = await getRecipeById(supabase, recipeId);

  if (!recipe) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">📖</div>
        <h2 className="text-xl font-semibold text-white mb-2">
          Recipe not found
        </h2>
        <p className="text-camp-earth mb-6">
          This recipe doesn&apos;t exist or you don&apos;t have access.
        </p>
        <Link
          href="/dashboard/recipes"
          className="inline-block bg-camp-forest hover:bg-camp-pine text-white font-medium py-2.5 px-5 rounded-lg transition-colors"
        >
          Back to recipes
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/dashboard/recipes"
          className="text-camp-earth hover:text-white text-sm transition-colors flex items-center gap-1"
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
              d="M15.75 19.5 8.25 12l7.5-7.5"
            />
          </svg>
          Back to Recipes
        </Link>
        <RecipeDeleteButton recipeId={recipe.id} />
      </div>

      <h1 className="text-2xl font-bold text-white mb-6">Edit Recipe</h1>
      <RecipeForm recipe={recipe} />
    </div>
  );
}
