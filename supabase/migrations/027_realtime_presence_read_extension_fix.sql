-- Fix SPEC-003b.1 presence authorization.
--
-- Migration 022's READ policy gated on `realtime.messages.extension = 'presence'`.
-- That silently denied EVERY trip member's subscribe with
--   "Unauthorized: You do not have permissions to read from this Channel topic:
--    presence:{tripId}"
-- even with a valid authenticated JWT and confirmed trip membership.
--
-- Root cause: when Supabase Realtime authorizes a channel JOIN, it evaluates the
-- SELECT policy on realtime.messages to answer "can this user READ this topic?".
-- At join time the message context's `extension` is NOT 'presence' (that value
-- only applies once presence state actually flows), so the `extension = 'presence'`
-- conjunct evaluated false/NULL and the whole AND chain failed. The real security
-- gate is topic shape + trip membership — both retained below. We drop ONLY the
-- extension filter from the READ policy.
--
-- The WRITE (INSERT) policy in migration 022 is left untouched: presence track()
-- writes ARE tagged extension = 'presence', so that conjunct matches correctly
-- and continues to scope writes to the presence extension.
--
-- Confirmed empirically (2026-06-27): a confirmed member's subscribe returns
-- CHANNEL_ERROR/Unauthorized with the extension filter present, and SUBSCRIBED
-- without it. The live DB was patched manually the same day; this migration
-- codifies that change so the repo and database stay in sync.

drop policy if exists "realtime_trip_presence_read" on realtime.messages;

create policy "realtime_trip_presence_read"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() ~ '^presence:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.is_trip_member_of(
      substring(realtime.topic() from 'presence:(.+)$')::uuid,
      (select auth.uid())
    )
  );
