export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string | null;
  expiration_date: string | null;
  condition: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryFormData {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  expiration_date: string;
  condition: string;
  notes: string;
}

export interface GroceryList {
  id: string;
  trip_id: string;
  created_at: string;
  updated_at: string;
}

export interface GroceryItem {
  id: string;
  grocery_list_id: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: string | null;
  is_purchased: boolean;
  is_manual: boolean;
  source_recipe: string | null;
  notes: string | null;
  sort_order: number;
}

export interface GroceryListWithItems extends GroceryList {
  trip_grocery_items: GroceryItem[];
}

export interface GroceryProgress {
  total: number;
  purchased: number;
}

export type ExpirationStatus = "ok" | "expiring_soon" | "expired";

export const INVENTORY_CATEGORIES = [
  "Uncategorized",
  "Canned Goods",
  "Condiments",
  "Dairy",
  "Drinks",
  "Dry Goods",
  "Frozen",
  "Grains",
  "Meat",
  "Produce",
  "Snacks",
  "Spices",
  "Other",
] as const;

export const GROCERY_CATEGORIES = [
  "Produce",
  "Meat",
  "Dairy",
  "Grains",
  "Canned Goods",
  "Condiments",
  "Spices",
  "Drinks",
  "Snacks",
  "Frozen",
  "Other",
] as const;

export const COMMON_UNITS = [
  "",
  "lbs",
  "oz",
  "kg",
  "g",
  "cups",
  "tbsp",
  "tsp",
  "ml",
  "liters",
  "cans",
  "bottles",
  "bags",
  "boxes",
  "count",
] as const;

export function getExpirationStatus(expirationDate: string | null): ExpirationStatus {
  if (!expirationDate) return "ok";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expDate = new Date(expirationDate + "T00:00:00");
  const diffMs = expDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "expired";
  if (diffDays <= 7) return "expiring_soon";
  return "ok";
}
