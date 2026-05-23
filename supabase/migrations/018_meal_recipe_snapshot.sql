-- SPEC-005b.3: Recipe snapshot on meal assignment
--
-- Adds a nullable jsonb column to trip_meals to store a point-in-time copy of
-- the assigned recipe at the moment it was added (or swapped) on a meal.
--
-- Design decisions:
--   - Nullable: null means "no snapshot captured yet — read the live recipe."
--     Existing rows are left as-is. Pre-migration data will fall back to the
--     live recipe, which matches the old behavior.
--   - No backfill: We cannot know what the recipe looked like at the time
--     those rows were created, so backfilling would be fabricating history —
--     exactly what this feature exists to prevent.
--   - Read path: For completed trips, the UI prefers recipe_snapshot when
--     non-null. For planning/active trips, the live recipe is always used.
--   - Immutable after creation: nothing in the app re-writes recipe_snapshot
--     after the meal row is written. Recipe library edits never touch this
--     column.

alter table public.trip_meals
  add column recipe_snapshot jsonb;
