-- SPEC-005: Meal Planning & Recipe Library
-- Tables: recipes, trip_meal_plans, trip_meals

-- ============================================================
-- RECIPES
-- ============================================================
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  description text,
  ingredients jsonb default '[]'::jsonb,
  instructions text,
  servings integer default 1,
  prep_time_minutes integer,
  cook_time_minutes integer,
  tags text[] default '{}',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.recipes enable row level security;

-- All authenticated users can read recipes
create policy "Recipes are viewable by authenticated users"
  on public.recipes for select
  to authenticated
  using (true);

-- Creator can insert recipes
create policy "Users can create their own recipes"
  on public.recipes for insert
  to authenticated
  with check (created_by = auth.uid());

-- Creator can update recipes
create policy "Users can update their own recipes"
  on public.recipes for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- Creator can delete recipes
create policy "Users can delete their own recipes"
  on public.recipes for delete
  to authenticated
  using (created_by = auth.uid());

create trigger recipes_updated_at
  before update on public.recipes
  for each row execute function public.update_updated_at();

-- ============================================================
-- TRIP MEAL PLANS
-- ============================================================
create table public.trip_meal_plans (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_at timestamptz default now() not null,
  unique (trip_id)
);

alter table public.trip_meal_plans enable row level security;

-- Trip members can view meal plans
create policy "Trip members can view meal plans"
  on public.trip_meal_plans for select
  to authenticated
  using (public.is_trip_member(trip_id));

-- Trip planners can create meal plans
create policy "Trip planners can create meal plans"
  on public.trip_meal_plans for insert
  to authenticated
  with check (public.is_trip_planner(trip_id));

-- Trip planners can update meal plans
create policy "Trip planners can update meal plans"
  on public.trip_meal_plans for update
  to authenticated
  using (public.is_trip_planner(trip_id));

-- Trip planners can delete meal plans
create policy "Trip planners can delete meal plans"
  on public.trip_meal_plans for delete
  to authenticated
  using (public.is_trip_planner(trip_id));

-- ============================================================
-- TRIP MEALS
-- ============================================================
create table public.trip_meals (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references public.trip_meal_plans(id) on delete cascade,
  day_date date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  recipe_id uuid references public.recipes(id) on delete set null,
  custom_meal_name text,
  notes text,
  sort_order integer default 0
);

alter table public.trip_meals enable row level security;

-- Trip members can view meals (via join to meal plan -> trip)
create policy "Trip members can view meals"
  on public.trip_meals for select
  to authenticated
  using (
    exists (
      select 1 from public.trip_meal_plans
      where trip_meal_plans.id = trip_meals.meal_plan_id
      and public.is_trip_member(trip_meal_plans.trip_id)
    )
  );

-- Trip planners can insert meals
create policy "Trip planners can insert meals"
  on public.trip_meals for insert
  to authenticated
  with check (
    exists (
      select 1 from public.trip_meal_plans
      where trip_meal_plans.id = trip_meals.meal_plan_id
      and public.is_trip_planner(trip_meal_plans.trip_id)
    )
  );

-- Trip planners can update meals
create policy "Trip planners can update meals"
  on public.trip_meals for update
  to authenticated
  using (
    exists (
      select 1 from public.trip_meal_plans
      where trip_meal_plans.id = trip_meals.meal_plan_id
      and public.is_trip_planner(trip_meal_plans.trip_id)
    )
  );

-- Trip planners can delete meals
create policy "Trip planners can delete meals"
  on public.trip_meals for delete
  to authenticated
  using (
    exists (
      select 1 from public.trip_meal_plans
      where trip_meal_plans.id = trip_meals.meal_plan_id
      and public.is_trip_planner(trip_meal_plans.trip_id)
    )
  );
