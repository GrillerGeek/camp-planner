-- SPEC-007: Task & Prep Management
-- Tables: task_templates, task_template_items, trip_tasks

-- ============================================================
-- TASK TEMPLATES
-- ============================================================
create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  description text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.task_templates enable row level security;

-- ============================================================
-- TASK TEMPLATE ITEMS
-- ============================================================
create table public.task_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.task_templates(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  sort_order int not null default 0
);

alter table public.task_template_items enable row level security;

-- ============================================================
-- TRIP TASKS
-- ============================================================
create table public.trip_tasks (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  assigned_to uuid references public.profiles(id),
  due_date date,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  is_completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  sort_order int not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.trip_tasks enable row level security;

-- Index for efficient trip task queries
create index idx_trip_tasks_trip_id on public.trip_tasks(trip_id);
create index idx_trip_tasks_assigned_to on public.trip_tasks(assigned_to);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
create trigger set_task_templates_updated_at
  before update on public.task_templates
  for each row execute function public.update_updated_at();

create trigger set_trip_tasks_updated_at
  before update on public.trip_tasks
  for each row execute function public.update_updated_at();

-- ============================================================
-- RLS POLICIES: task_templates
-- ============================================================

-- All authenticated users can read all task templates
create policy "task_templates_select"
  on public.task_templates for select
  to authenticated
  using (true);

-- Only creator can insert
create policy "task_templates_insert"
  on public.task_templates for insert
  to authenticated
  with check (created_by = auth.uid());

-- Only creator can update
create policy "task_templates_update"
  on public.task_templates for update
  to authenticated
  using (created_by = auth.uid());

-- Only creator can delete
create policy "task_templates_delete"
  on public.task_templates for delete
  to authenticated
  using (created_by = auth.uid());

-- ============================================================
-- RLS POLICIES: task_template_items
-- ============================================================

-- Readable if the parent template is readable (all authenticated)
create policy "task_template_items_select"
  on public.task_template_items for select
  to authenticated
  using (true);

-- Manageable only by the parent template creator
create policy "task_template_items_insert"
  on public.task_template_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.task_templates
      where task_templates.id = template_id
      and task_templates.created_by = auth.uid()
    )
  );

create policy "task_template_items_update"
  on public.task_template_items for update
  to authenticated
  using (
    exists (
      select 1 from public.task_templates
      where task_templates.id = template_id
      and task_templates.created_by = auth.uid()
    )
  );

create policy "task_template_items_delete"
  on public.task_template_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.task_templates
      where task_templates.id = template_id
      and task_templates.created_by = auth.uid()
    )
  );

-- ============================================================
-- RLS POLICIES: trip_tasks
-- ============================================================

-- SELECT: any trip member (planner or viewer)
create policy "trip_tasks_select"
  on public.trip_tasks for select
  to authenticated
  using (public.is_trip_member(trip_id));

-- INSERT: only planners
create policy "trip_tasks_insert"
  on public.trip_tasks for insert
  to authenticated
  with check (public.is_trip_planner(trip_id));

-- UPDATE: planners can update anything; viewers can only toggle completion on tasks assigned to them
create policy "trip_tasks_update"
  on public.trip_tasks for update
  to authenticated
  using (
    public.is_trip_planner(trip_id)
    or (
      public.is_trip_member(trip_id)
      and assigned_to = auth.uid()
    )
  );

-- DELETE: only planners
create policy "trip_tasks_delete"
  on public.trip_tasks for delete
  to authenticated
  using (public.is_trip_planner(trip_id));

-- ============================================================
-- REALTIME
-- ============================================================
alter publication supabase_realtime add table public.trip_tasks;
