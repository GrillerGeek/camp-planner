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

export async function uploadJournalPhoto(
  supabase: SupabaseClient,
  tripId: string,
  file: File
): Promise<string> {
  const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${tripId}/${crypto.randomUUID()}.${fileExt}`;

  const { error } = await supabase.storage
    .from("journal-photos")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
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
