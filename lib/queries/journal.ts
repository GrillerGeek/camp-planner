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
  const fileName = `${tripId}/${crypto.randomUUID()}.${fileExt}`;

  const { error } = await supabase.storage
    .from("journal-photos")
    .upload(fileName, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from("journal-photos")
    .getPublicUrl(fileName);

  return data.publicUrl;
}
