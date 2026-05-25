-- SPEC-004b.2: give trips a trip_type so template matching can use it.
--
-- packing_templates already carries trip_types text[] (migration 002),
-- but trips have no trip_type field — the template apply modal can show
-- the chips but has nothing to match against. INT-002 calls out
-- trip-type-aware templates as the value prop; without a column on
-- trips, that promise is fictional.
--
-- Nullable on purpose:
--   - Existing rows would otherwise need a default that misrepresents
--     them ('tent' is a guess, not knowledge).
--   - Some trips really are mixed / undecided when first created; null
--     models "not specified" cleanly. The matching code in the apply
--     modal treats null as "no trip_type signal, fall back to season".
--
-- CHECK constraint mirrors the TRIP_TYPES TS enum
-- (lib/types/packing.ts) — tent / rv / cabin / backpacking.

alter table public.trips
  add column trip_type text
    check (trip_type is null or trip_type in ('tent', 'rv', 'cabin', 'backpacking'));
