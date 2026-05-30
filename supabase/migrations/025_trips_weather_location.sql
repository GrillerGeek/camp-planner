-- SPEC-010: weather-aware trip prep — store the resolved campsite location.
-- Additive + backward-compatible. Existing trips read null = "location not
-- yet resolved". Coordinates are client-supplied via a Server Action, so the
-- range CHECK constraints are the authoritative trust boundary (cf. SPEC-010
-- review blocker 3). No RLS change: columns inherit the existing trips row
-- policies.

alter table public.trips
  add column latitude double precision,
  add column longitude double precision,
  add column location_label text;

alter table public.trips
  add constraint trips_latitude_range_check
    check (latitude is null or latitude between -90 and 90),
  add constraint trips_longitude_range_check
    check (longitude is null or longitude between -180 and 180),
  add constraint trips_location_label_length_check
    check (location_label is null or char_length(location_label) <= 200);
