-- SPEC-003b.1: lock presence:{tripId} channels to trip members.
--
-- Today's RealtimeProvider opens a public channel named
-- "presence:{tripId}" via supabase.channel(...). Any authenticated user
-- who guesses or learns a trip UUID can subscribe and observe who is
-- viewing the trip. RLS on the trips / trip_members tables protects
-- Postgres-change events, but presence broadcasts go through
-- realtime.messages — which by default has no row policies and is open
-- to all authenticated users.
--
-- The fix has two halves:
--   1. (this migration) Add SELECT + INSERT policies on realtime.messages
--      that authorize the presence topic ONLY when the user is a member
--      of the corresponding trip.
--   2. (RealtimeProvider) Pass config: { private: true } so the channel
--      opts into RLS-based authorization. Without the client opt-in,
--      these policies have no effect.
--
-- Reference: https://supabase.com/docs/guides/realtime/authorization
--
-- Topic shape: "presence:{tripId}" where tripId is a UUID. The UUID
-- regex check guards against malformed topics so the ::uuid cast cannot
-- raise inside the policy (which would surface as a generic error to
-- the client).
--
-- We use the existing public.is_trip_member_of helper (migration 002)
-- — SECURITY DEFINER, search_path locked — to avoid recursive RLS on
-- trip_members. The helper accepts (trip_id, user_id) so we pass
-- auth.uid() explicitly.

create policy "realtime_trip_presence_read"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'presence'
    and realtime.topic() ~ '^presence:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.is_trip_member_of(
      substring(realtime.topic() from 'presence:(.+)$')::uuid,
      (select auth.uid())
    )
  );

create policy "realtime_trip_presence_write"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and realtime.topic() ~ '^presence:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.is_trip_member_of(
      substring(realtime.topic() from 'presence:(.+)$')::uuid,
      (select auth.uid())
    )
  );

-- Per-feature channels (packing-{listId}, grocery-{listId}, tasks
-- filtered by tripId) do NOT pass private: true and therefore stay
-- public — they ride table RLS via postgres_changes, which is already
-- correct. If we ever lock those down too, follow the same pattern:
-- mark them private client-side AND add a matching topic-scoped policy.
