import { SupabaseClient } from "@supabase/supabase-js";
import { TripReservation, ReservationFormData } from "@/lib/types/reservations";

export async function getTripReservations(
  supabase: SupabaseClient,
  tripId: string
): Promise<TripReservation[]> {
  const { data, error } = await supabase
    .from("trip_reservations")
    .select("*")
    .eq("trip_id", tripId)
    .order("check_in_date", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function addReservation(
  supabase: SupabaseClient,
  tripId: string,
  formData: ReservationFormData
): Promise<TripReservation> {
  const { data, error } = await supabase
    .from("trip_reservations")
    .insert({
      trip_id: tripId,
      campground_name: formData.campground_name.trim(),
      site_number: formData.site_number.trim() || null,
      confirmation_number: formData.confirmation_number.trim() || null,
      check_in_date: formData.check_in_date || null,
      check_out_date: formData.check_out_date || null,
      check_in_time: formData.check_in_time.trim() || null,
      check_out_time: formData.check_out_time.trim() || null,
      cost: formData.cost ? parseFloat(formData.cost) : null,
      contact_info: formData.contact_info.trim() || null,
      notes: formData.notes.trim() || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateReservation(
  supabase: SupabaseClient,
  reservationId: string,
  formData: Partial<ReservationFormData>
): Promise<TripReservation> {
  const updateData: Record<string, unknown> = {};

  if (formData.campground_name !== undefined)
    updateData.campground_name = formData.campground_name.trim();
  if (formData.site_number !== undefined)
    updateData.site_number = formData.site_number.trim() || null;
  if (formData.confirmation_number !== undefined)
    updateData.confirmation_number = formData.confirmation_number.trim() || null;
  if (formData.check_in_date !== undefined)
    updateData.check_in_date = formData.check_in_date || null;
  if (formData.check_out_date !== undefined)
    updateData.check_out_date = formData.check_out_date || null;
  if (formData.check_in_time !== undefined)
    updateData.check_in_time = formData.check_in_time.trim() || null;
  if (formData.check_out_time !== undefined)
    updateData.check_out_time = formData.check_out_time.trim() || null;
  if (formData.cost !== undefined)
    updateData.cost = formData.cost ? parseFloat(formData.cost) : null;
  if (formData.contact_info !== undefined)
    updateData.contact_info = formData.contact_info.trim() || null;
  if (formData.notes !== undefined)
    updateData.notes = formData.notes.trim() || null;

  const { data, error } = await supabase
    .from("trip_reservations")
    .update(updateData)
    .eq("id", reservationId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteReservation(
  supabase: SupabaseClient,
  reservationId: string
): Promise<void> {
  const { error } = await supabase
    .from("trip_reservations")
    .delete()
    .eq("id", reservationId);
  if (error) throw error;
}

export async function getReservationProgress(
  supabase: SupabaseClient,
  tripId: string
): Promise<{ count: number } | null> {
  const { data, error } = await supabase
    .from("trip_reservations")
    .select("id")
    .eq("trip_id", tripId);

  if (error) throw error;
  if (!data) return null;

  return { count: data.length };
}
