export interface Trip {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  campsite_info: string | null;
  notes: string | null;
  status: "planning" | "active" | "completed";
  /** Mirrors TRIP_TYPES values; null = unspecified. Used by the
   *  packing-template apply modal to surface matching templates. */
  trip_type: "tent" | "rv" | "cabin" | "backpacking" | null;
  /** SPEC-010: resolved campsite location. Null = not yet geocoded.
   *  Range-validated at the DB layer (migration 025). */
  latitude: number | null;
  longitude: number | null;
  location_label: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TripMember {
  id: string;
  trip_id: string;
  user_id: string;
  role: "planner" | "viewer";
  joined_at: string;
}

export interface TripWithMemberCount extends Trip {
  member_count: number;
}

export interface TripFormData {
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  campsite_info: string;
  notes: string;
  /** Empty string means "not set" — written to DB as null. */
  trip_type: "" | "tent" | "rv" | "cabin" | "backpacking";
}
