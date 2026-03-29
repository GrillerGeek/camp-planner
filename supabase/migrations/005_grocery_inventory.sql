-- SPEC-006: Grocery List Generation & Camper Inventory
-- Tables: camper_inventory, trip_grocery_lists, trip_grocery_items

-- ============================================================
-- CAMPER INVENTORY
-- ============================================================
create table public.camper_inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  category text default 'Uncategorized',
  quantity numeric default 1 check (quantity > 0),
  unit text,
  expiration_date date,
  condition text,
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.camper_inventory enable row level security;

-- All authenticated users can read inventory (shared household)
create policy "Inventory is viewable by authenticated users"
  on public.camper_inventory for select
  to authenticated
  using (true);

-- All authenticated users can insert inventory
create policy "Authenticated users can add inventory"
  on public.camper_inventory for insert
  to authenticated
  with check (created_by = auth.uid());

-- All authenticated users can update inventory
create policy "Authenticated users can update inventory"
  on public.camper_inventory for update
  to authenticated
  using (true);

-- All authenticated users can delete inventory
create policy "Authenticated users can delete inventory"
  on public.camper_inventory for delete
  to authenticated
  using (true);

create trigger camper_inventory_updated_at
  before update on public.camper_inventory
  for each row execute function public.update_updated_at();

-- ============================================================
-- TRIP GROCERY LISTS
-- ============================================================
create table public.trip_grocery_lists (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (trip_id)
);

alter table public.trip_grocery_lists enable row level security;

-- Trip members can view grocery lists
create policy "Trip members can view grocery lists"
  on public.trip_grocery_lists for select
  to authenticated
  using (public.is_trip_member(trip_id));

-- Trip planners can create grocery lists
create policy "Trip planners can create grocery lists"
  on public.trip_grocery_lists for insert
  to authenticated
  with check (public.is_trip_planner(trip_id));

-- Trip planners can update grocery lists
create policy "Trip planners can update grocery lists"
  on public.trip_grocery_lists for update
  to authenticated
  using (public.is_trip_planner(trip_id));

-- Trip planners can delete grocery lists
create policy "Trip planners can delete grocery lists"
  on public.trip_grocery_lists for delete
  to authenticated
  using (public.is_trip_planner(trip_id));

create trigger trip_grocery_lists_updated_at
  before update on public.trip_grocery_lists
  for each row execute function public.update_updated_at();

-- ============================================================
-- TRIP GROCERY ITEMS
-- ============================================================
create table public.trip_grocery_items (
  id uuid primary key default gen_random_uuid(),
  grocery_list_id uuid not null references public.trip_grocery_lists(id) on delete cascade,
  name text not null check (char_length(name) >= 1),
  quantity numeric default 1,
  unit text,
  category text,
  is_purchased boolean default false,
  is_manual boolean default false,
  source_recipe text,
  notes text,
  sort_order integer default 0
);

alter table public.trip_grocery_items enable row level security;

-- Trip members can view grocery items (via join to grocery list -> trip)
create policy "Trip members can view grocery items"
  on public.trip_grocery_items for select
  to authenticated
  using (
    exists (
      select 1 from public.trip_grocery_lists
      where trip_grocery_lists.id = trip_grocery_items.grocery_list_id
      and public.is_trip_member(trip_grocery_lists.trip_id)
    )
  );

-- Trip planners can insert grocery items
create policy "Trip planners can insert grocery items"
  on public.trip_grocery_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.trip_grocery_lists
      where trip_grocery_lists.id = trip_grocery_items.grocery_list_id
      and public.is_trip_planner(trip_grocery_lists.trip_id)
    )
  );

-- Trip planners can update grocery items
create policy "Trip planners can update grocery items"
  on public.trip_grocery_items for update
  to authenticated
  using (
    exists (
      select 1 from public.trip_grocery_lists
      where trip_grocery_lists.id = trip_grocery_items.grocery_list_id
      and public.is_trip_planner(trip_grocery_lists.trip_id)
    )
  );

-- Trip planners can delete grocery items
create policy "Trip planners can delete grocery items"
  on public.trip_grocery_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.trip_grocery_lists
      where trip_grocery_lists.id = trip_grocery_items.grocery_list_id
      and public.is_trip_planner(trip_grocery_lists.trip_id)
    )
  );

-- Enable realtime for grocery items for live check-off sync
alter publication supabase_realtime add table public.trip_grocery_items;
