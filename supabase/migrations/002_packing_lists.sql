-- SPEC-004: Smart Packing Lists
-- Tables: packing_templates, packing_template_items, trip_packing_lists, trip_packing_items

-- ============================================================
-- HELPER FUNCTIONS (security definer for RLS)
-- ============================================================

create or replace function public.is_trip_member(_trip_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.trip_members
    where trip_members.trip_id = _trip_id
    and trip_members.user_id = auth.uid()
  );
$$;

create or replace function public.is_trip_planner(_trip_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.trip_members
    where trip_members.trip_id = _trip_id
    and trip_members.user_id = auth.uid()
    and trip_members.role = 'planner'
  );
$$;

-- ============================================================
-- PACKING TEMPLATES
-- ============================================================
create table public.packing_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  description text,
  seasons text[] default '{}',
  trip_types text[] default '{}',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.packing_templates enable row level security;

-- All authenticated users can read templates
create policy "Templates are viewable by authenticated users"
  on public.packing_templates for select
  to authenticated
  using (true);

-- Creator can insert templates
create policy "Users can create their own templates"
  on public.packing_templates for insert
  to authenticated
  with check (created_by = auth.uid());

-- Creator can update templates
create policy "Users can update their own templates"
  on public.packing_templates for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- Creator can delete templates
create policy "Users can delete their own templates"
  on public.packing_templates for delete
  to authenticated
  using (created_by = auth.uid());

create trigger packing_templates_updated_at
  before update on public.packing_templates
  for each row execute function public.update_updated_at();

-- ============================================================
-- PACKING TEMPLATE ITEMS
-- ============================================================
create table public.packing_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.packing_templates(id) on delete cascade,
  name text not null,
  category text not null,
  is_essential boolean default false,
  quantity integer default 1,
  notes text,
  sort_order integer default 0
);

alter table public.packing_template_items enable row level security;

-- All authenticated users can read template items
create policy "Template items are viewable by authenticated users"
  on public.packing_template_items for select
  to authenticated
  using (true);

-- Creator of the template can insert items
create policy "Template owners can insert items"
  on public.packing_template_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.packing_templates
      where packing_templates.id = packing_template_items.template_id
      and packing_templates.created_by = auth.uid()
    )
  );

-- Creator of the template can update items
create policy "Template owners can update items"
  on public.packing_template_items for update
  to authenticated
  using (
    exists (
      select 1 from public.packing_templates
      where packing_templates.id = packing_template_items.template_id
      and packing_templates.created_by = auth.uid()
    )
  );

-- Creator of the template can delete items
create policy "Template owners can delete items"
  on public.packing_template_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.packing_templates
      where packing_templates.id = packing_template_items.template_id
      and packing_templates.created_by = auth.uid()
    )
  );

-- ============================================================
-- TRIP PACKING LISTS
-- ============================================================
create table public.trip_packing_lists (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_from_template uuid references public.packing_templates(id) on delete set null,
  created_at timestamptz default now() not null
);

alter table public.trip_packing_lists enable row level security;

-- Trip members can view packing lists
create policy "Trip members can view packing lists"
  on public.trip_packing_lists for select
  to authenticated
  using (public.is_trip_member(trip_id));

-- Trip planners can create packing lists
create policy "Trip planners can create packing lists"
  on public.trip_packing_lists for insert
  to authenticated
  with check (public.is_trip_planner(trip_id));

-- Trip planners can update packing lists
create policy "Trip planners can update packing lists"
  on public.trip_packing_lists for update
  to authenticated
  using (public.is_trip_planner(trip_id));

-- Trip planners can delete packing lists
create policy "Trip planners can delete packing lists"
  on public.trip_packing_lists for delete
  to authenticated
  using (public.is_trip_planner(trip_id));

-- ============================================================
-- TRIP PACKING ITEMS
-- ============================================================
create table public.trip_packing_items (
  id uuid primary key default gen_random_uuid(),
  packing_list_id uuid not null references public.trip_packing_lists(id) on delete cascade,
  name text not null,
  category text not null,
  quantity integer default 1,
  is_packed boolean default false,
  assigned_to uuid references public.profiles(id) on delete set null,
  notes text,
  sort_order integer default 0
);

alter table public.trip_packing_items enable row level security;

-- Trip members can view packing items (via join to packing list -> trip)
create policy "Trip members can view packing items"
  on public.trip_packing_items for select
  to authenticated
  using (
    exists (
      select 1 from public.trip_packing_lists
      where trip_packing_lists.id = trip_packing_items.packing_list_id
      and public.is_trip_member(trip_packing_lists.trip_id)
    )
  );

-- Trip planners can insert packing items
create policy "Trip planners can insert packing items"
  on public.trip_packing_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.trip_packing_lists
      where trip_packing_lists.id = trip_packing_items.packing_list_id
      and public.is_trip_planner(trip_packing_lists.trip_id)
    )
  );

-- Trip planners can update packing items
create policy "Trip planners can update packing items"
  on public.trip_packing_items for update
  to authenticated
  using (
    exists (
      select 1 from public.trip_packing_lists
      where trip_packing_lists.id = trip_packing_items.packing_list_id
      and public.is_trip_planner(trip_packing_lists.trip_id)
    )
  );

-- Trip planners can delete packing items
create policy "Trip planners can delete packing items"
  on public.trip_packing_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.trip_packing_lists
      where trip_packing_lists.id = trip_packing_items.packing_list_id
      and public.is_trip_planner(trip_packing_lists.trip_id)
    )
  );

-- Enable realtime for trip_packing_items for live check-off sync
alter publication supabase_realtime add table public.trip_packing_items;
