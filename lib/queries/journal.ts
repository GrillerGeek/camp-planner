import { SupabaseClient } from "@supabase/supabase-js";
import { TripJournalEntry } from "@/lib/types/reservations";

export async function getTripJournalEntries(
  supabase: SupabaseClient,
  tripId: string
): Promise<TripJournalEntry[]> {
  const { data, error } = await supabase
    .from("trip_journal_entries")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function addJournalEntry(
  supabase: SupabaseClient,
  tripId: string,
  content: string,
  photoUrls: string[] = []
): Promise<TripJournalEntry> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("trip_journal_entries")
    .insert({
      trip_id: tripId,
      content: content.trim(),
      photo_urls: photoUrls,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateJournalEntry(
  supabase: SupabaseClient,
  entryId: string,
  updates: { content?: string; photo_urls?: string[] }
): Promise<TripJournalEntry> {
  const updateData: Record<string, unknown> = {};
  if (updates.content !== undefined) updateData.content = updates.content.trim();
  if (updates.photo_urls !== undefined) updateData.photo_urls = updates.photo_urls;

  const { data, error } = await supabase
    .from("trip_journal_entries")
    .update(updateData)
    .eq("id", entryId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteJournalEntry(
  supabase: SupabaseClient,
  entryId: string
): Promise<void> {
  const { error } = await supabase
    .from("trip_journal_entries")
    .delete()
    .eq("id", entryId);
  if (error) throw error;
}

// Mirror the journal-photos bucket's file_size_limit + allowed_mime_types
// (migration 014). Server enforces this regardless of client behavior; the
// client check is for UX — rejects locally before sending bytes.
export const JOURNAL_PHOTO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const JOURNAL_PHOTO_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
] as const;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export async function uploadJournalPhoto(
  supabase: SupabaseClient,
  tripId: string,
  file: File
): Promise<string> {
  if (file.size > JOURNAL_PHOTO_MAX_BYTES) {
    throw new Error(
      `"${file.name}" is ${formatBytes(file.size)} — photos must be under ${formatBytes(
        JOURNAL_PHOTO_MAX_BYTES
      )}.`
    );
  }
  if (
    file.type &&
    !JOURNAL_PHOTO_ALLOWED_MIME.includes(
      file.type as (typeof JOURNAL_PHOTO_ALLOWED_MIME)[number]
    )
  ) {
    throw new Error(
      `"${file.name}" is not a supported image type (${file.type}). Use JPEG, PNG, WEBP, HEIC, or GIF.`
    );
  }

  const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${tripId}/${crypto.randomUUID()}.${fileExt}`;

  const { error } = await supabase.storage
    .from("journal-photos")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });

  if (error) throw error;

  return path;
}

export async function getSignedJournalPhotoUrls(
  supabase: SupabaseClient,
  paths: string[],
  ttlSeconds: number = 3600
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const { data, error } = await supabase.storage
    .from("journal-photos")
    .createSignedUrls(paths, ttlSeconds);

  if (error) throw error;

  const map: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) {
      map[item.path] = item.signedUrl;
    }
  }
  return map;
}
