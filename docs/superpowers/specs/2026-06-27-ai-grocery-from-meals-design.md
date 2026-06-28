# AI grocery suggestions from custom meal names — design

**Date:** 2026-06-27
**Status:** approved, implementing
**Author:** Jason Robey (with Claude)

## Problem

`generateGroceryListFromMeals` builds a grocery list only from **recipe-linked**
meals' structured ingredients. Real camping meal plans are mostly **custom
free-text meals** ("Brats/Mets", "Pizza Pudgie Pies", "Lunchmeat Sandwiches")
with no `recipe_id` and no ingredients. For such trips, "Generate from Meals"
correctly produces an empty list — the feature doesn't serve how people actually
plan. (Observed on a live trip: 12 custom meals, 0 recipe-linked → empty list.)

## Goal

Let a planner turn custom meal names into a practical grocery list via AI, with a
mandatory review step that also satisfies the original "confirm before adding
duplicates" requirement. Quantities scale to a headcount entered at generate
time. The existing deterministic recipe-aggregation path is left untouched.

## Decisions (locked during brainstorming)

- **Quantities:** ask headcount at generate time, defaulting to the trip's member
  count; AI scales to `headcount × days`.
- **Duplicates:** flagged in the review step; default to *skip*, with a per-item
  *skip / merge (add quantity)* toggle. Nothing duplicates without confirmation.
- **Architecture:** **One** "Generate from meals" button opens a single review
  modal. The modal proposes from **both** sources — recipe-linked meals via exact
  ingredient aggregation, and custom (name-only) meals via AI — merged into one
  reviewable list. (Revised from the initial "additive second button" approach
  after that proved confusing: two meal-sourced buttons in the action bar.) To
  avoid duplicating aggregation logic, the recipe-aggregation core is extracted
  into `computeRecipeProposals` and reused by both the modal proposal flow and the
  existing `generateGroceryListFromMeals` write path (whose behavior is unchanged).

## Architecture (Approach A)

### 1. `lib/ai/grocery-from-meals.ts` (`server-only`) — inference engine

- Zod schema:
  `{ items: { name: string, quantity: number, unit: string | null, category: enum(GROCERY_CATEGORIES) }[] }`.
  `GROCERY_CATEGORIES` is the existing const in `lib/types/inventory.ts`.
- Input: `{ mealNames: string[], headcount: number, days: number, destination, tripType }`.
- Prompt: consolidate shared ingredients across meals, scale quantities to
  `headcount × days`, choose a category from the canonical list, skip obvious
  staples (salt/pepper) unless central to a dish, return a practical shopping list.
- `generateText` + `Output.object({ schema })` + model `"anthropic/claude-sonnet-4.6"`
  — identical shape to `lib/ai/meal-suggestions.ts`.
- Exports `GrocerySuggestion` type and `generateGroceryFromMeals(args)`.

### 2. `app/dashboard/trips/[tripId]/grocery/actions.ts` (`"use server"`, new)

- `proposeGroceryFromMeals(tripId, headcount): Promise<{ ok:true, items } | { ok:false, error }>`,
  where each item is `{ name, quantity, unit, category, source: "recipe" | "ai" }`.
- Re-fetch trip via `getTripById` (RLS authz) and verify planner via
  `getUserRoleForTrip` — return an error for viewers.
- **Recipe items:** `computeRecipeProposals(supabase, tripId)` → mapped with
  `source: "recipe"` (runs regardless of headcount; exact quantities).
- **AI items:** for meals where `recipe_id IS NULL`, pass the `custom_meal_name`s
  to the AI module scaled to `headcount × days` → mapped with `source: "ai"`.
- If the AI call throws but recipe items exist, return the recipe items rather
  than failing the whole flow; if both are empty → `{ ok:false, error }`.
- **Returns the combined proposed set; performs no writes.**

### 3. `lib/queries/grocery.ts` → `bulkAddGroceryItems`

```
bulkAddGroceryItems(
  supabase,
  tripId,
  { toInsert: NewItem[], toMerge: { id: string, addQuantity: number }[] }
): Promise<void>
```

- Resolves/creates the grocery list (`getOrCreateGroceryList`).
- One `insert()` for `toInsert`; per-row quantity bump for `toMerge`.
- Inserted AI items: `is_manual = true` (so a later deterministic
  "Regenerate from Meals", which deletes `is_manual = false` rows, won't wipe
  them), `is_purchased = false`, `source_recipe = "AI suggested"` for provenance,
  `category` from the suggestion, `sort_order` appended after existing rows.

### 4. `grocery/components/GenerateGroceryModal.tsx` (client) — review step

- Trigger: the single planner-only **"Generate from meals"** button on the
  grocery page (label becomes "Add more from meals" once the list is non-empty).
- *Step 1:* headcount number input (default = `memberCount` prop) → "Generate
  draft" calls `proposeGroceryFromMeals`; show spinner; surface `{ ok:false }`
  errors.
- *Step 2:* proposed items, each with a small **source badge** ("recipe" vs
  "AI"): include checkbox, editable name/quantity/unit/category. A row whose
  `(lower(name), lower(unit))` matches an existing list item shows an **"on list"
  flag** and a skip/merge toggle defaulting to **skip**.
- Footer **"Add N items"**: from the toggles/checkboxes compute
  `{ toInsert, toMerge }` and commit. `toInsert` = included **non-duplicate** rows.
  `toMerge` = duplicate rows toggled to "merge", mapping to the existing row id +
  chosen quantity. Duplicate rows left on "skip" and any unchecked rows are dropped.
  (The duplicate toggle is two-state: skip or merge — there is no "add as a second
  row" option.)
- On success: splice the new/updated items into local state, close modal.
  Realtime propagates to other members.

### 5. Wiring

- `grocery/page.tsx`: fetch member count (count query on `trip_members`) and pass
  `memberCount` to `GroceryListClient`.
- `GroceryListClient`: the former deterministic "Generate from Meals" action-bar
  button is replaced by the single "Generate from meals" button that opens the
  modal; render the modal; merge committed items into `items` state by id. The
  deterministic `generateGroceryListFromMeals` is still invoked by the
  stale-list banner's contextual "Regenerate" button (refreshes recipe-derived
  rows when meals change) — it is not a second action-bar button.

## Data flow

custom meal names + headcount → action → AI module → proposed items → review modal
(dedupe vs live list, user edits/toggles) → `bulkAddGroceryItems` → list updates +
realtime.

## Error handling

- AI gateway failure → `{ ok:false, error }` shown in the modal.
- No custom meals → friendly message, no AI call.
- Non-planner → action rejects; button hidden for viewers anyway.
- Hallucinations / wrong quantities → mitigated by the mandatory review step; the
  user edits or removes any item before commit.
- Offline → existing `useIsOffline` guard disables the commit, consistent with the
  rest of `GroceryListClient`.

## Out of scope

- `generateGroceryListFromMeals`'s write behavior is unchanged; it is only
  refactored to call the extracted `computeRecipeProposals` (shared aggregation).
- No DB migration — reuses existing `trip_grocery_items` columns.
- The `.maybeSingle()` 406 fix (separate, already in the working tree) ships
  alongside but is independent of this feature.
- Cross-source dedupe *within* a single proposal (e.g. AI "buns" + a recipe
  "buns") is not auto-merged in v1 — both appear as rows and the reviewer can
  uncheck one. Only dedupe against the **existing saved list** is automated.

## Testing

No test runner is configured. Keep the review→commit mapping (`toInsert`/`toMerge`
derivation) as a pure function so it is checkable in isolation. Verify end-to-end
manually against the live 12-custom-meal trip: generate, review, toggle a
duplicate to merge, commit, confirm rows land with correct quantities and survive
a deterministic regenerate.
