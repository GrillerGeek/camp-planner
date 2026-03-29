export interface PackingTemplate {
  id: string;
  name: string;
  description: string | null;
  seasons: string[];
  trip_types: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PackingTemplateItem {
  id: string;
  template_id: string;
  name: string;
  category: string;
  is_essential: boolean;
  quantity: number;
  notes: string | null;
  sort_order: number;
}

export interface PackingTemplateWithItems extends PackingTemplate {
  packing_template_items: PackingTemplateItem[];
}

export interface TripPackingList {
  id: string;
  trip_id: string;
  created_from_template: string | null;
  created_at: string;
}

export interface TripPackingItem {
  id: string;
  packing_list_id: string;
  name: string;
  category: string;
  quantity: number;
  is_packed: boolean;
  assigned_to: string | null;
  notes: string | null;
  sort_order: number;
}

export interface TripPackingListWithItems extends TripPackingList {
  trip_packing_items: TripPackingItem[];
}

export interface PackingTemplateFormData {
  name: string;
  description: string;
  seasons: string[];
  trip_types: string[];
}

export interface PackingItemFormData {
  name: string;
  category: string;
  quantity: number;
  notes: string;
  assigned_to: string | null;
}

export const SEASONS = ["spring", "summer", "fall", "winter"] as const;
export const TRIP_TYPES = ["tent", "rv", "cabin", "backpacking"] as const;
export const CATEGORIES = [
  "shelter",
  "cooking",
  "clothing",
  "safety",
  "personal",
  "tools",
  "food",
  "other",
] as const;
