-- Phase 3: SPEC-009 Guest Sharing v2 (security rewrite)
-- Addresses the four CRITICAL findings in the 2026-04-14 deep review:
--   1. Guest page used SUPABASE_SERVICE_ROLE_KEY — replaced by a security
--      definer function (get_shared_trip) that is the only anon entry point.
--   2. Massive scope leakage — the function returns exactly the data shape
--      specified by EXP-030 and filters packing/tasks to assigned items.
--   3. Weak tokens — replaced plaintext UUIDv4 with 256-bit random tokens
--      stored only as SHA-256 hashes.
--   4. Unauthorized revocation — new revoke_share_link() function requires
--      the caller to be a planner of the specific trip.

-- pgcrypto ships with Supabase in the `extensions` schema. This is a no-op
-- if already installed; we specify the schema explicitly so the SECURITY
-- DEFINER functions below can reference extensions.gen_random_bytes /
-- extensions.digest with search_path = ''.
create extension if not exists pgcrypto with schema extensions;

-- ============================================================
-- 1. Schema: replace plaintext token with token_hash
-- ============================================================
-- All existing share links were already disabled in Phase 0.1 (the guest
-- page returns 404 unconditionally). Drop them and rebuild the column.

delete from public.trip_share_links;

drop policy if exists "trip_share_links_select_anon" on public.trip_share_links;

alter table public.trip_share_links drop column if exists token;
alter table public.trip_share_links
  add column token_hash text unique not null;

-- ============================================================
-- 2. create_share_link: generate plaintext, store hash, return plaintext
-- ============================================================
-- Returns the plaintext token to the caller EXACTLY ONCE. The server only
-- retains the hash. If the planner loses the plaintext, they must revoke
-- and create a new link.

create or replace function public.create_share_link(_trip_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plaintext text;
  v_hash text;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_trip_planner(_trip_id) then
    raise exception 'Only trip planners may create share links';
  end if;

  -- 32 bytes = 256 bits, base64url encoded (URL-safe, no padding)
  v_plaintext := replace(
    replace(
      replace(
        encode(extensions.gen_random_bytes(32), 'base64'),
        '+', '-'
      ),
      '/', '_'
    ),
    '=', ''
  );

  v_hash := encode(extensions.digest(v_plaintext::bytea, 'sha256'), 'hex');

  insert into public.trip_share_links (trip_id, token_hash, created_by)
  values (_trip_id, v_hash, v_user_id);

  return v_plaintext;
end;
$$;

grant execute on function public.create_share_link(uuid) to authenticated;

-- ============================================================
-- 3. revoke_share_link: planner-of-specific-trip check
-- ============================================================

create or replace function public.revoke_share_link(
  _link_id uuid,
  _trip_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_trip_planner(_trip_id) then
    raise exception 'Only trip planners may revoke share links';
  end if;

  update public.trip_share_links
  set revoked_at = now()
  where id = _link_id
    and trip_id = _trip_id
    and revoked_at is null;
end;
$$;

grant execute on function public.revoke_share_link(uuid, uuid) to authenticated;

-- ============================================================
-- 4. get_shared_trip: the single anonymous entry point
-- ============================================================
-- SECURITY DEFINER so it can read trip data without anon-level RLS.
-- Returns exactly the scoped payload the spec permits: trip metadata,
-- planner name, reservations (without cost/contact), meals, assigned
-- packing items, assigned tasks.

create or replace function public.get_shared_trip(_token_plaintext text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_link public.trip_share_links;
  v_trip_id uuid;
  v_result jsonb;
begin
  if _token_plaintext is null or length(_token_plaintext) < 20 then
    return null;
  end if;

  v_hash := encode(extensions.digest(_token_plaintext::bytea, 'sha256'), 'hex');

  select * into v_link
  from public.trip_share_links
  where token_hash = v_hash
    and revoked_at is null;

  if not found then
    return null;
  end if;

  v_trip_id := v_link.trip_id;

  select jsonb_build_object(
    'trip', jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'destination', t.destination,
      'start_date', t.start_date,
      'end_date', t.end_date,
      'campsite_info', t.campsite_info,
      'status', t.status
    ),
    'planner_name', coalesce(p.display_name, 'A planner'),
    'reservations', (
      select coalesce(
        jsonb_agg(jsonb_build_object(
          'id', r.id,
          'campground_name', r.campground_name,
          'site_number', r.site_number,
          'check_in_date', r.check_in_date,
          'check_out_date', r.check_out_date,
          'check_in_time', r.check_in_time,
          'check_out_time', r.check_out_time,
          'notes', r.notes
          -- Intentionally excluded: cost, confirmation_number, contact_info
        ) order by r.check_in_date nulls last, r.sort_order),
        '[]'::jsonb
      )
      from public.trip_reservations r
      where r.trip_id = v_trip_id
    ),
    'meals', (
      select coalesce(
        jsonb_agg(jsonb_build_object(
          'id', m.id,
          'day_date', m.day_date,
          'meal_type', m.meal_type,
          'custom_meal_name', m.custom_meal_name,
          'notes', m.notes,
          'recipe_name', rec.name
        ) order by m.day_date, m.meal_type),
        '[]'::jsonb
      )
      from public.trip_meals m
      join public.trip_meal_plans mp on mp.id = m.meal_plan_id
      left join public.recipes rec on rec.id = m.recipe_id
      where mp.trip_id = v_trip_id
    ),
    'packing_items', (
      select coalesce(
        jsonb_agg(jsonb_build_object(
          'id', pi.id,
          'name', pi.name,
          'category', pi.category,
          'quantity', pi.quantity,
          'is_packed', pi.is_packed,
          'assigned_to_name', prof.display_name
        ) order by pi.category, pi.sort_order),
        '[]'::jsonb
      )
      from public.trip_packing_items pi
      join public.trip_packing_lists pl on pl.id = pi.packing_list_id
      left join public.profiles prof on prof.id = pi.assigned_to
      where pl.trip_id = v_trip_id
        and pi.assigned_to is not null
    ),
    'tasks', (
      select coalesce(
        jsonb_agg(jsonb_build_object(
          'id', tk.id,
          'title', tk.title,
          'description', tk.description,
          'assigned_to_name', prof.display_name,
          'due_date', tk.due_date,
          'priority', tk.priority,
          'is_completed', tk.is_completed
        ) order by tk.sort_order),
        '[]'::jsonb
      )
      from public.trip_tasks tk
      left join public.profiles prof on prof.id = tk.assigned_to
      where tk.trip_id = v_trip_id
        and tk.assigned_to is not null
    )
  ) into v_result
  from public.trips t
  left join public.profiles p on p.id = v_link.created_by
  where t.id = v_trip_id;

  return v_result;
end;
$$;

grant execute on function public.get_shared_trip(text) to anon;
grant execute on function public.get_shared_trip(text) to authenticated;
