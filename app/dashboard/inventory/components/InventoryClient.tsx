"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
} from "@/lib/queries/inventory";
import {
  InventoryItem,
  INVENTORY_CATEGORIES,
  COMMON_UNITS,
  getExpirationStatus,
} from "@/lib/types/inventory";

interface InventoryClientProps {
  initialInventory: InventoryItem[];
}

export function InventoryClient({ initialInventory }: InventoryClientProps) {
  const [items, setItems] = useState<InventoryItem[]>(initialInventory);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    category: "Uncategorized",
    quantity: 1,
    unit: "",
    expiration_date: "",
    condition: "",
    notes: "",
  });
  const [editValues, setEditValues] = useState<Record<string, string | number>>(
    {}
  );

  const supabase = createClient();

  // Add new item
  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newItem.name.trim()) return;

    setLoading(true);
    try {
      const item = await addInventoryItem(supabase, {
        name: newItem.name,
        category: newItem.category,
        quantity: newItem.quantity,
        unit: newItem.unit || null,
        expiration_date: newItem.expiration_date || null,
        condition: newItem.condition || null,
        notes: newItem.notes || null,
      });
      setItems((prev) => [...prev, item]);
      setNewItem({
        name: "",
        category: "Uncategorized",
        quantity: 1,
        unit: "",
        expiration_date: "",
        condition: "",
        notes: "",
      });
      setShowAddForm(false);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  // Start editing
  function startEditing(item: InventoryItem) {
    setEditingId(item.id);
    setEditValues({
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit ?? "",
      expiration_date: item.expiration_date ?? "",
      condition: item.condition ?? "",
      notes: item.notes ?? "",
    });
  }

  // Save edit
  async function handleSaveEdit(itemId: string) {
    setLoading(true);
    try {
      const updated = await updateInventoryItem(supabase, itemId, {
        name: editValues.name as string,
        category: editValues.category as string,
        quantity: Number(editValues.quantity),
        unit: (editValues.unit as string) || null,
        expiration_date: (editValues.expiration_date as string) || null,
        condition: (editValues.condition as string) || null,
        notes: (editValues.notes as string) || null,
      });
      setItems((prev) => prev.map((i) => (i.id === itemId ? updated : i)));
      setEditingId(null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  // Delete item
  async function handleDelete(itemId: string) {
    const prev = items;
    setItems((items) => items.filter((i) => i.id !== itemId));
    try {
      await deleteInventoryItem(supabase, itemId);
    } catch {
      setItems(prev);
    }
  }

  // Filter items
  const filteredItems =
    filterCategory === "all"
      ? items
      : items.filter((i) => i.category === filterCategory);

  // Group by category
  const grouped = filteredItems.reduce<Record<string, InventoryItem[]>>(
    (acc, item) => {
      const cat = item.category || "Uncategorized";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    },
    {}
  );

  // Count expiring items
  const expiringCount = items.filter(
    (i) => getExpirationStatus(i.expiration_date) === "expiring_soon"
  ).length;
  const expiredCount = items.filter(
    (i) => getExpirationStatus(i.expiration_date) === "expired"
  ).length;

  return (
    <div>
      {/* Expiration Summary */}
      {(expiringCount > 0 || expiredCount > 0) && (
        <div className="flex flex-wrap gap-3 mb-6">
          {expiredCount > 0 && (
            <div className="bg-camp-fire/20 border border-camp-fire/40 rounded-lg px-3 py-2 text-sm text-camp-fire">
              {expiredCount} expired item{expiredCount > 1 ? "s" : ""}
            </div>
          )}
          {expiringCount > 0 && (
            <div className="bg-camp-sand/20 border border-camp-sand/40 rounded-lg px-3 py-2 text-sm text-camp-sand">
              {expiringCount} expiring soon
            </div>
          )}
        </div>
      )}

      {/* Actions Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-camp-forest hover:bg-camp-pine text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          Add Item
        </button>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
        >
          <option value="all" className="bg-camp-night">
            All categories
          </option>
          {INVENTORY_CATEGORIES.map((cat) => (
            <option key={cat} value={cat} className="bg-camp-night">
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddItem}
          className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6"
        >
          <h3 className="text-white font-medium mb-3">Add Inventory Item</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <input
              type="text"
              value={newItem.name}
              onChange={(e) =>
                setNewItem((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Item name *"
              required
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
            />
            <select
              value={newItem.category}
              onChange={(e) =>
                setNewItem((prev) => ({ ...prev, category: e.target.value }))
              }
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
            >
              {INVENTORY_CATEGORIES.map((cat) => (
                <option key={cat} value={cat} className="bg-camp-night">
                  {cat}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="number"
                min={0.01}
                step="any"
                value={newItem.quantity}
                onChange={(e) =>
                  setNewItem((prev) => ({
                    ...prev,
                    quantity: parseFloat(e.target.value) || 1,
                  }))
                }
                placeholder="Qty"
                className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
              />
              <select
                value={newItem.unit}
                onChange={(e) =>
                  setNewItem((prev) => ({ ...prev, unit: e.target.value }))
                }
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
              >
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u} className="bg-camp-night">
                    {u || "no unit"}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="date"
              value={newItem.expiration_date}
              onChange={(e) =>
                setNewItem((prev) => ({
                  ...prev,
                  expiration_date: e.target.value,
                }))
              }
              placeholder="Expiration date"
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent [color-scheme:dark]"
            />
            <input
              type="text"
              value={newItem.condition}
              onChange={(e) =>
                setNewItem((prev) => ({ ...prev, condition: e.target.value }))
              }
              placeholder="Condition (e.g., opened, sealed)"
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
            />
            <input
              type="text"
              value={newItem.notes}
              onChange={(e) =>
                setNewItem((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder="Notes"
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
            />
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="submit"
              disabled={loading || !newItem.name.trim()}
              className="bg-camp-forest hover:bg-camp-pine disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {loading ? "Adding..." : "Add Item"}
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-camp-earth hover:text-white text-sm py-2 px-4 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Items List */}
      {items.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-5xl mb-4">📦</div>
          <h2 className="text-lg font-semibold text-white mb-2">
            No inventory items yet
          </h2>
          <p className="text-camp-earth text-sm max-w-sm mx-auto">
            Add items to track what you have in your camper. This inventory
            persists across all trips.
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-camp-earth text-sm">
            No items match the current filter.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, categoryItems]) => (
              <div key={category}>
                <h3 className="text-sm font-medium text-camp-earth uppercase tracking-wider mb-2">
                  {category} ({categoryItems.length})
                </h3>
                <div className="space-y-1">
                  {categoryItems.map((item) => {
                    const expStatus = getExpirationStatus(
                      item.expiration_date
                    );
                    const isEditing = editingId === item.id;

                    if (isEditing) {
                      return (
                        <div
                          key={item.id}
                          className="bg-white/10 border border-camp-forest/40 rounded-lg p-3"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            <input
                              type="text"
                              value={editValues.name}
                              onChange={(e) =>
                                setEditValues((prev) => ({
                                  ...prev,
                                  name: e.target.value,
                                }))
                              }
                              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
                            />
                            <select
                              value={editValues.category}
                              onChange={(e) =>
                                setEditValues((prev) => ({
                                  ...prev,
                                  category: e.target.value,
                                }))
                              }
                              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
                            >
                              {INVENTORY_CATEGORIES.map((cat) => (
                                <option
                                  key={cat}
                                  value={cat}
                                  className="bg-camp-night"
                                >
                                  {cat}
                                </option>
                              ))}
                            </select>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                min={0.01}
                                step="any"
                                value={editValues.quantity}
                                onChange={(e) =>
                                  setEditValues((prev) => ({
                                    ...prev,
                                    quantity:
                                      parseFloat(e.target.value) || 1,
                                  }))
                                }
                                className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
                              />
                              <select
                                value={editValues.unit}
                                onChange={(e) =>
                                  setEditValues((prev) => ({
                                    ...prev,
                                    unit: e.target.value,
                                  }))
                                }
                                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
                              >
                                {COMMON_UNITS.map((u) => (
                                  <option
                                    key={u}
                                    value={u}
                                    className="bg-camp-night"
                                  >
                                    {u || "no unit"}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <input
                              type="date"
                              value={editValues.expiration_date}
                              onChange={(e) =>
                                setEditValues((prev) => ({
                                  ...prev,
                                  expiration_date: e.target.value,
                                }))
                              }
                              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent [color-scheme:dark]"
                            />
                            <input
                              type="text"
                              value={editValues.condition}
                              onChange={(e) =>
                                setEditValues((prev) => ({
                                  ...prev,
                                  condition: e.target.value,
                                }))
                              }
                              placeholder="Condition"
                              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
                            />
                            <input
                              type="text"
                              value={editValues.notes}
                              onChange={(e) =>
                                setEditValues((prev) => ({
                                  ...prev,
                                  notes: e.target.value,
                                }))
                              }
                              placeholder="Notes"
                              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
                            />
                          </div>
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => handleSaveEdit(item.id)}
                              disabled={loading}
                              className="bg-camp-forest hover:bg-camp-pine disabled:opacity-50 text-white text-xs font-medium py-1.5 px-3 rounded-lg transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-camp-earth hover:text-white text-xs py-1.5 px-3 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 group transition-colors ${
                          expStatus === "expired"
                            ? "bg-camp-fire/15 border border-camp-fire/30"
                            : expStatus === "expiring_soon"
                            ? "bg-camp-sand/10 border border-camp-sand/30"
                            : "bg-white/5"
                        }`}
                      >
                        {/* Item Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-white">
                              {item.name}
                            </span>
                            {expStatus === "expired" && (
                              <span className="text-xs bg-camp-fire/30 text-camp-fire px-1.5 py-0.5 rounded font-medium">
                                Expired
                              </span>
                            )}
                            {expStatus === "expiring_soon" && (
                              <span className="text-xs bg-camp-sand/30 text-camp-sand px-1.5 py-0.5 rounded font-medium">
                                Expiring Soon
                              </span>
                            )}
                            {item.condition && (
                              <span className="text-xs text-camp-earth/60">
                                ({item.condition})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-camp-earth text-xs">
                              {item.quantity}
                              {item.unit ? ` ${item.unit}` : ""}
                            </span>
                            {item.expiration_date && (
                              <span className="text-camp-earth/60 text-xs">
                                Exp: {item.expiration_date}
                              </span>
                            )}
                            {item.notes && (
                              <span className="text-camp-earth/40 text-xs truncate">
                                {item.notes}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => startEditing(item)}
                            className="text-camp-earth/50 hover:text-camp-sky transition-colors p-1"
                            title="Edit"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-camp-earth/30 hover:text-red-400 transition-colors p-1"
                            title="Delete"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6 18 18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
