-- SPEC-004b.3: who-and-when audit columns on packing items.
--
-- Today trip_packing_items stores only is_packed (boolean). We want
-- to show "Angie packed this at 3:42 PM" in the UI and have a record
-- of who did what for trip history. Mirrors the trip_tasks pattern
-- (migration 004) which already carries completed_at + completed_by.
--
-- Server-stamped via trigger: the application layer would otherwise
-- be the trust boundary, and a malicious viewer with direct Supabase
-- client access could set packed_by to anyone's uuid. The trigger
-- forces packed_at = now(), packed_by = auth.uid() on every is_packed
-- flip and discards client-supplied values when is_packed is unchanged.

alter table public.trip_packing_items
  add column packed_at timestamptz,
  add column packed_by uuid references public.profiles(id) on delete set null;

create or replace function public.stamp_packing_item_packed_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- A new item with is_packed = true (rare but possible via direct
    -- client write) gets stamped immediately. The common case
    -- (is_packed = false on insert) leaves both fields null.
    if new.is_packed = true then
      new.packed_at := now();
      new.packed_by := auth.uid();
    else
      new.packed_at := null;
      new.packed_by := null;
    end if;
    return new;
  end if;

  -- UPDATE path.
  if new.is_packed is distinct from old.is_packed then
    if new.is_packed = true then
      new.packed_at := now();
      new.packed_by := auth.uid();
    else
      new.packed_at := null;
      new.packed_by := null;
    end if;
  else
    -- is_packed didn't change — preserve the existing audit values
    -- regardless of what the client tried to write. Closes the
    -- tampering vector on direct Supabase client calls.
    new.packed_at := old.packed_at;
    new.packed_by := old.packed_by;
  end if;
  return new;
end;
$$;

create trigger trip_packing_items_audit_stamp
  before insert or update on public.trip_packing_items
  for each row execute function public.stamp_packing_item_packed_audit();
