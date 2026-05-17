-- SPEC-008b.3: bucket-side file size + MIME enforcement for journal photos.
--
-- The client validates uploads in lib/queries/journal.ts (uploadJournalPhoto
-- + handleFiles), but a malicious client can bypass that. The actual
-- guarantee comes from Supabase Storage rejecting upload requests that
-- exceed the bucket's file_size_limit or allowed_mime_types.
--
-- Limits chosen to match the client constants:
--   - 10 MB per file (fits a high-quality phone photo with margin)
--   - Image types only: jpeg, png, webp, heic, heif, gif

update storage.buckets
   set file_size_limit = 10 * 1024 * 1024,
       allowed_mime_types = array[
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/heic',
         'image/heif',
         'image/gif'
       ]
 where id = 'journal-photos';
