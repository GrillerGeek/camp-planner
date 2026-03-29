export interface TripShareLink {
  id: string;
  trip_id: string;
  token: string;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
}

export interface SharedTripData {
  trip: {
    name: string;
    destination: string;
    start_date: string;
    end_date: string;
    campsite_info: string | null;
    status: string;
  };
  planner_name: string;
  meals: SharedMeal[];
  packing_items: SharedPackingItem[];
  tasks: SharedTask[];
}

export interface SharedMeal {
  id: string;
  day_date: string;
  meal_type: string;
  custom_meal_name: string | null;
  notes: string | null;
  recipe_name: string | null;
}

export interface SharedPackingItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  is_packed: boolean;
  assigned_to_name: string | null;
}

export interface SharedTask {
  id: string;
  title: string;
  description: string | null;
  assigned_to_name: string | null;
  due_date: string | null;
  priority: string;
  is_completed: boolean;
}
