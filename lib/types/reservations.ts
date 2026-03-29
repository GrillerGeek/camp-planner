export interface TripReservation {
  id: string;
  trip_id: string;
  campground_name: string;
  site_number: string | null;
  confirmation_number: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  cost: number | null;
  contact_info: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ReservationFormData {
  campground_name: string;
  site_number: string;
  confirmation_number: string;
  check_in_date: string;
  check_out_date: string;
  check_in_time: string;
  check_out_time: string;
  cost: string;
  contact_info: string;
  notes: string;
}

export interface TripJournalEntry {
  id: string;
  trip_id: string;
  content: string;
  photo_urls: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalEntryFormData {
  content: string;
  photos: File[];
}
