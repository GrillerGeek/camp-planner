import { SupabaseClient } from "@supabase/supabase-js";
import { InventoryItem } from "@/lib/types/inventory";

export async function getInventory(
  supabase: SupabaseClient
): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from("camper_inventory")
    .select("*")
    .order("category")
    .order("name");

  if (error) throw error;
  return data ?? [];
}

export async function addInventoryItem(
  supabase: SupabaseClient,
  item: {
    name: string;
    category: string;
    quantity: number;
    unit?: string | null;
    expiration_date?: string | null;
    condition?: string | null;
    notes?: string | null;
  }
): Promise<InventoryItem> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("camper_inventory")
    .insert({
      name: item.name.trim(),
      category: item.category || "Uncategorized",
      quantity: item.quantity,
      unit: item.unit?.trim() || null,
      expiration_date: item.expiration_date || null,
      condition: item.condition?.trim() || null,
      notes: item.notes?.trim() || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateInventoryItem(
  supabase: SupabaseClient,
  itemId: string,
  updates: Partial<{
    name: string;
    category: string;
    quantity: number;
    unit: string | null;
    expiration_date: string | null;
    condition: string | null;
    notes: string | null;
  }>
): Promise<InventoryItem> {
  const updateData: Record<string, unknown> = {};
  if (updates.name !== undefined) updateData.name = updates.name.trim();
  if (updates.category !== undefined) updateData.category = updates.category;
  if (updates.quantity !== undefined) updateData.quantity = updates.quantity;
  if (updates.unit !== undefined) updateData.unit = updates.unit?.trim() || null;
  if (updates.expiration_date !== undefined)
    updateData.expiration_date = updates.expiration_date || null;
  if (updates.condition !== undefined)
    updateData.condition = updates.condition?.trim() || null;
  if (updates.notes !== undefined)
    updateData.notes = updates.notes?.trim() || null;

  const { data, error } = await supabase
    .from("camper_inventory")
    .update(updateData)
    .eq("id", itemId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteInventoryItem(
  supabase: SupabaseClient,
  itemId: string
): Promise<void> {
  const { error } = await supabase
    .from("camper_inventory")
    .delete()
    .eq("id", itemId);
  if (error) throw error;
}

export async function getExpiringItems(
  supabase: SupabaseClient,
  daysAhead: number = 7
): Promise<InventoryItem[]> {
  const today = new Date();
  const futureDate = new Date(today);
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const { data, error } = await supabase
    .from("camper_inventory")
    .select("*")
    .not("expiration_date", "is", null)
    .lte("expiration_date", futureDate.toISOString().split("T")[0])
    .order("expiration_date");

  if (error) throw error;
  return data ?? [];
}
