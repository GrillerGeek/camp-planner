export interface Trip {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  campsite_info: string | null;
  notes: string | null;
  status: "planning" | "active" | "completed";
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
}
