-- Phase 0.2: Lock down journal-photos storage bucket
-- Findings (SPEC-008 deep review, 2026-04-14):
--   1. Bucket was public; any URL granted read access to anyone on the internet
--   2. INSERT/DELETE policies only checked bucket_id, not trip membership —
--      any authenticated user could upload/delete arbitrary photos
--   3. Photo URLs stored as public URLs in trip_journal_entries.photo_urls
-- Fix:
--   - Flip bucket to private
--   - Replace policies with membership-scoped checks using path-derived trip_id
--   - Rewrite stored photo_urls from public URLs to bare storage paths
--     (signed URLs are generated at render time)

-- 1. Make bucket private
update storage.buckets set public = false where id = 'journal-photos';

-- 2. Drop the old wide-open policies
drop policy if exists "journal_photos_select" on storage.objects;
drop policy if exists "journal_photos_insert" on storage.objects;
drop policy if exists "journal_photos_delete" on storage.objects;

-- 3. New policies: trip-member read, trip-planner write
-- Path layout: <trip_id>/<uuid>.<ext>
-- storage.foldername(name)[1] returns the first path segment (the trip_id)

create policy "journal_photos_select_member"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'journal-photos'
    and public.is_trip_member((storage.foldername(name))[1]::uuid)
  );

create policy "journal_photos_insert_planner"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'journal-photos'
    and public.is_trip_planner((storage.foldername(name))[1]::uuid)
  );

create policy "journal_photos_delete_planner"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'journal-photos'
    and public.is_trip_planner((storage.foldername(name))[1]::uuid)
  );

-- 4. Rewrite existing photo_urls from full public URLs to bare storage paths
-- Old format: https://<host>/storage/v1/object/public/journal-photos/<trip_id>/<uuid>.<ext>
-- New format: <trip_id>/<uuid>.<ext>
-- Rows already storing paths (containing no http prefix) are left alone.
update public.trip_journal_entries
set photo_urls = coalesce((
  select array_agg(
    case
      when url like '%/storage/v1/object/public/journal-photos/%'
      then split_part(url, '/storage/v1/object/public/journal-photos/', 2)
      else url
    end
    order by ord
  )
  from unnest(photo_urls) with ordinality as u(url, ord)
), '{}')
where photo_urls is not null and array_length(photo_urls, 1) > 0;
