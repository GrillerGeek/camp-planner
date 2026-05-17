"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  addTemplateItem,
  deleteTemplateItem,
  updateTemplateItem,
} from "@/lib/queries/packing";
import { PackingTemplateItem, CATEGORIES } from "@/lib/types/packing";

interface TemplateItemsEditorProps {
  templateId: string;
  initialItems: PackingTemplateItem[];
}

interface NewItemState {
  name: string;
  category: string;
  is_essential: boolean;
  quantity: number;
  notes: string;
}

interface EditItemState {
  name: string;
  category: string;
  is_essential: boolean;
  quantity: number;
  notes: string;
}

const blankNewItem: NewItemState = {
  name: "",
  category: "other",
  is_essential: false,
  quantity: 1,
  notes: "",
};

export function TemplateItemsEditor({
  templateId,
  initialItems,
}: TemplateItemsEditorProps) {
  const [items, setItems] = useState<PackingTemplateItem[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [newItem, setNewItem] = useState<NewItemState>(blankNewItem);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<EditItemState>({
    name: "",
    category: "other",
    is_essential: false,
    quantity: 1,
    notes: "",
  });

  const supabase = createClient();

  const grouped = items.reduce<Record<string, PackingTemplateItem[]>>(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    },
    {}
  );

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newItem.name.trim()) return;

    setLoading(true);
    try {
      const item = await addTemplateItem(supabase, {
        template_id: templateId,
        name: newItem.name,
        category: newItem.category,
        is_essential: newItem.is_essential,
        quantity: newItem.quantity,
        notes: newItem.notes.trim() || undefined,
        sort_order: items.length,
      });
      setItems((prev) => [...prev, item]);
      // Preserve the category + essential checkbox between adds for fast entry
      setNewItem({
        ...blankNewItem,
        category: newItem.category,
        is_essential: newItem.is_essential,
      });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function startEdit(item: PackingTemplateItem) {
    setEditingId(item.id);
    setEditItem({
      name: item.name,
      category: item.category,
      is_essential: item.is_essential,
      quantity: item.quantity,
      notes: item.notes ?? "",
    });
  }

  async function handleSaveEdit(itemId: string) {
    if (!editItem.name.trim()) return;
    try {
      const updated = await updateTemplateItem(supabase, itemId, {
        name: editItem.name.trim(),
        category: editItem.category,
        is_essential: editItem.is_essential,
        quantity: editItem.quantity,
        notes: editItem.notes.trim() || "",
      });
      setItems((prev) => prev.map((i) => (i.id === itemId ? updated : i)));
      setEditingId(null);
    } catch {
      // ignore
    }
  }

  async function handleDeleteItem(itemId: string) {
    const prev = items;
    setItems((items) => items.filter((i) => i.id !== itemId));
    try {
      await deleteTemplateItem(supabase, itemId);
    } catch {
      setItems(prev);
    }
  }

  return (
    <div>
      {/* Add Item Form */}
      <form
        onSubmit={handleAddItem}
        className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4"
      >
        <div className="space-y-3">
          <div className="flex gap-3">
            <input
              type="text"
              value={newItem.name}
              onChange={(e) =>
                setNewItem((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Item name"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
            />
            <select
              value={newItem.category}
              onChange={(e) =>
                setNewItem((prev) => ({ ...prev, category: e.target.value }))
              }
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat} className="bg-camp-night">
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <input
            type="text"
            value={newItem.notes}
            onChange={(e) =>
              setNewItem((prev) => ({ ...prev, notes: e.target.value }))
            }
            placeholder="Notes (optional)"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
          />

          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-sm text-camp-earth">
              <input
                type="checkbox"
                checked={newItem.is_essential}
                onChange={(e) =>
                  setNewItem((prev) => ({
                    ...prev,
                    is_essential: e.target.checked,
                  }))
                }
                className="rounded border-white/20"
              />
              Essential
            </label>
            <label className="flex items-center gap-1.5 text-sm text-camp-earth">
              Qty:
              <input
                type="number"
                min={1}
                max={99}
                value={newItem.quantity}
                onChange={(e) =>
                  setNewItem((prev) => ({
                    ...prev,
                    quantity: parseInt(e.target.value) || 1,
                  }))
                }
                className="w-14 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
              />
            </label>
            <button
              type="submit"
              disabled={loading || !newItem.name.trim()}
              className="ml-auto bg-camp-forest hover:bg-camp-pine disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {loading ? "Adding..." : "Add Item"}
            </button>
          </div>
        </div>
      </form>

      {/* Items List by Category */}
      {items.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-camp-earth/60 text-sm">
            No items yet. Add items above to build your template.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, categoryItems]) => (
              <div key={category}>
                <h3 className="text-sm font-medium text-camp-earth uppercase tracking-wider mb-2">
                  {category} ({categoryItems.length})
                </h3>
                <div className="space-y-1">
                  {categoryItems.map((item) =>
                    editingId === item.id ? (
                      <div
                        key={item.id}
                        className="bg-white/5 border border-camp-forest/30 rounded-lg p-3 space-y-2"
                      >
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editItem.name}
                            onChange={(e) =>
                              setEditItem((prev) => ({
                                ...prev,
                                name: e.target.value,
                              }))
                            }
                            className="flex-1 bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-camp-forest/50"
                            autoFocus
                          />
                          <select
                            value={editItem.category}
                            onChange={(e) =>
                              setEditItem((prev) => ({
                                ...prev,
                                category: e.target.value,
                              }))
                            }
                            className="bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-camp-forest/50"
                          >
                            {CATEGORIES.map((cat) => (
                              <option key={cat} value={cat} className="bg-camp-night">
                                {cat}
                              </option>
                            ))}
                          </select>
                        </div>
                        <input
                          type="text"
                          value={editItem.notes}
                          onChange={(e) =>
                            setEditItem((prev) => ({
                              ...prev,
                              notes: e.target.value,
                            }))
                          }
                          placeholder="Notes (optional)"
                          className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-sm text-white placeholder-camp-earth/50 focus:outline-none focus:ring-1 focus:ring-camp-forest/50"
                        />
                        <div className="flex items-center gap-3 flex-wrap">
                          <label className="flex items-center gap-1.5 text-xs text-camp-earth">
                            <input
                              type="checkbox"
                              checked={editItem.is_essential}
                              onChange={(e) =>
                                setEditItem((prev) => ({
                                  ...prev,
                                  is_essential: e.target.checked,
                                }))
                              }
                              className="rounded border-white/20"
                            />
                            Essential
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-camp-earth">
                            Qty:
                            <input
                              type="number"
                              min={1}
                              max={99}
                              value={editItem.quantity}
                              onChange={(e) =>
                                setEditItem((prev) => ({
                                  ...prev,
                                  quantity: parseInt(e.target.value) || 1,
                                }))
                              }
                              className="w-14 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white text-center focus:outline-none focus:ring-1 focus:ring-camp-forest/50"
                            />
                          </label>
                          <div className="ml-auto flex gap-2">
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-camp-earth hover:text-white text-xs py-1.5 px-2 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveEdit(item.id)}
                              disabled={!editItem.name.trim()}
                              className="bg-camp-forest hover:bg-camp-pine disabled:opacity-50 text-white text-xs font-medium py-1.5 px-3 rounded transition-colors"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={item.id}
                        className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 group"
                      >
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="text-white text-sm">{item.name}</span>
                          {item.quantity > 1 && (
                            <span className="text-camp-earth text-xs">
                              x{item.quantity}
                            </span>
                          )}
                          {item.is_essential && (
                            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-camp-fire/15 text-camp-fire border border-camp-fire/30">
                              essential
                            </span>
                          )}
                          {item.notes && (
                            <span className="text-camp-earth/60 text-xs italic truncate max-w-xs">
                              — {item.notes}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={() => startEdit(item)}
                            className="text-camp-earth/40 hover:text-camp-sky transition-colors p-1"
                            title="Edit"
                          >
                            <svg
                              className="w-3.5 h-3.5"
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
                            onClick={() => handleDeleteItem(item.id)}
                            className="text-camp-earth/40 hover:text-red-400 transition-colors p-1"
                            title="Delete"
                          >
                            <svg
                              className="w-3.5 h-3.5"
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
                    )
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
