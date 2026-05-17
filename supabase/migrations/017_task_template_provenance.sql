-- SPEC-007b.1/.2: provenance + relative due dates on task templates.
--
-- .1 — trip_tasks.template_source_id links a generated task back to the
--      task_template_items row it came from. Powers the dup-apply
--      warning (.3) and enables future "regenerate template-sourced
--      tasks" flows.
-- .2 — task_template_items.relative_due_days (int, negative = before
--      trip start) lets the template say "7 days before trip" and the
--      apply step computes the actual due_date from trip.start_date.
--      task_template_items.priority mirrors the trip_tasks priority
--      constraint so templates can specify defaults.

alter table public.trip_tasks
  add column if not exists template_source_id uuid
    references public.task_template_items(id) on delete set null;

alter table public.task_template_items
  add column if not exists relative_due_days integer;

alter table public.task_template_items
  add column if not exists priority text
    not null
    default 'medium'
    check (priority in ('low', 'medium', 'high'));

-- Used by the dup-apply check: find existing tasks for a trip whose
-- template_source_id belongs to a given template.
create index if not exists trip_tasks_template_source_idx
  on public.trip_tasks (template_source_id)
  where template_source_id is not null;
