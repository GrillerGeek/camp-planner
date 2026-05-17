-- SPEC-002d.3: viewers can check off their own assigned packing items.
--
-- The SPEC-004 retro disabled check-off for all non-planners. But the
-- product premise (Jason + Angie + occasional guests) puts viewers in
-- charge of items assigned to them. They should be able to mark those
-- packed when they do the work.
--
-- Strategy: parallel to migration 009's trip_tasks viewer-scope trigger.
--   1. New UPDATE policy lets any trip member update a packing item if
--      it's assigned to them.
--   2. BEFORE UPDATE trigger restricts non-planners to mutating ONLY
--      is_packed on those items. Title/category/quantity/notes/
--      is_essential/assigned_to/sort_order stay planner-only.

-- ============================================================
-- 1. Additional UPDATE policy for assignees
-- ============================================================
-- The existing "Trip planners can update packing items" policy stays.
-- This new policy is OR-evaluated alongside it.

create policy "Assignees can update their own packing items"
  on public.trip_packing_items for update
  to authenticated
  using (
    assigned_to is not null
    and assigned_to = auth.uid()
    and exists (
      select 1 from public.trip_packing_lists
      where trip_packing_lists.id = trip_packing_items.packing_list_id
        and public.is_trip_member(trip_packing_lists.trip_id)
    )
  )
  with check (
    assigned_to is not null
    and assigned_to = auth.uid()
    and exists (
      select 1 from public.trip_packing_lists
      where trip_packing_lists.id = trip_packing_items.packing_list_id
        and public.is_trip_member(trip_packing_lists.trip_id)
    )
  );

-- ============================================================
-- 2. Column-scope trigger for non-planners
-- ============================================================
create or replace function public.enforce_trip_packing_items_viewer_column_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id uuid;
begin
  -- Resolve the trip id via the list join (item -> list -> trip)
  select trip_id into v_trip_id
  from public.trip_packing_lists
  where id = new.packing_list_id;

  -- Planners can change anything
  if public.is_trip_planner(v_trip_id) then
    return new;
  end if;

  -- Non-planners must be the assignee
  if new.assigned_to is null or new.assigned_to != auth.uid() then
    raise exception 'Only the assignee may modify this item';
  end if;

  -- Non-planners may only toggle is_packed
  if new.name is distinct from old.name
    or new.category is distinct from old.category
    or new.quantity is distinct from old.quantity
    or new.is_essential is distinct from old.is_essential
    or new.assigned_to is distinct from old.assigned_to
    or new.notes is distinct from old.notes
    or new.sort_order is distinct from old.sort_order
    or new.packing_list_id is distinct from old.packing_list_id
  then
    raise exception 'Viewers may only toggle is_packed on their assigned items';
  end if;

  return new;
end;
$$;

drop trigger if exists trip_packing_items_enforce_viewer_scope on public.trip_packing_items;
create trigger trip_packing_items_enforce_viewer_scope
  before update on public.trip_packing_items
  for each row execute function public.enforce_trip_packing_items_viewer_column_scope();
