-- SPEC-006b.2: track when the meal plan changes vs. when the grocery
-- list was last generated, so we can show a "regenerate?" banner.
--
-- Today, editing meals after generating a grocery list silently leaves
-- the list out of sync — the user has to remember to re-generate. We
-- want a clear signal in the UI when there's drift.

-- ============================================================
-- 1. Track when a meal plan was last changed
-- ============================================================
-- meals_changed_at gets bumped by triggers on the trip_meals child
-- table. Default = now() so existing plans are treated as "changed
-- recently" the first time the page loads.

alter table public.trip_meal_plans
  add column if not exists meals_changed_at timestamptz not null default now();

-- ============================================================
-- 2. Track when the grocery list was last regenerated from meals
-- ============================================================
-- Nullable: a grocery list that has never been generated has
-- last_generated_at IS NULL.

alter table public.trip_grocery_lists
  add column if not exists last_generated_at timestamptz;

-- ============================================================
-- 3. Bump meals_changed_at on any trip_meals mutation
-- ============================================================
create or replace function public.bump_meal_plan_changed_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_id uuid;
begin
  v_plan_id := coalesce(new.meal_plan_id, old.meal_plan_id);
  if v_plan_id is not null then
    update public.trip_meal_plans
       set meals_changed_at = now()
     where id = v_plan_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trip_meals_bump_changed_at on public.trip_meals;
create trigger trip_meals_bump_changed_at
  after insert or update or delete on public.trip_meals
  for each row execute function public.bump_meal_plan_changed_at();
