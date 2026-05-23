-- SPEC-005b.3 hardening: recipe_snapshot immutability on completed trips.
--
-- Addresses Oriana HIGH: the UI disables "Swap recipe" on completed trips,
-- but RLS alone allows a planner to overwrite recipe_snapshot via a direct
-- Supabase client call. A BEFORE UPDATE trigger adds the DB-level guard that
-- makes defense-in-depth complete.
--
-- Pattern mirrors migration 012 (packing viewer checkoff): RLS enforces
-- coarse access; trigger enforces fine-grained column invariant.
--
-- Security: SECURITY DEFINER so the function can read public.trips.status
-- regardless of the caller's RLS scope. search_path is locked to '' to
-- prevent search_path injection attacks (same convention as migration 012).

create or replace function public.enforce_recipe_snapshot_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_status text;
begin
  -- Only act when recipe_snapshot is actually changing.
  -- is distinct from handles NULLs symmetrically (NULL != NULL is false with
  -- plain !=, but NULL is distinct from NULL is false — i.e. two NULLs are
  -- treated as equal, which is what we want).
  if new.recipe_snapshot is not distinct from old.recipe_snapshot then
    return new;
  end if;

  -- Resolve the trip status via the meal_plan join (meal -> meal_plan -> trip).
  select t.status into v_trip_status
  from public.trip_meal_plans mp
  join public.trips t on t.id = mp.trip_id
  where mp.id = new.meal_plan_id;

  if v_trip_status = 'completed' then
    raise exception 'Recipe snapshot is immutable on completed trips';
  end if;

  return new;
end;
$$;

drop trigger if exists trip_meals_recipe_snapshot_immutable on public.trip_meals;
create trigger trip_meals_recipe_snapshot_immutable
  before update on public.trip_meals
  for each row execute function public.enforce_recipe_snapshot_immutable();
