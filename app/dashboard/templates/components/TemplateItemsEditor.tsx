"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  addTemplateItem,
  deleteTemplateItem,
} from "@/lib/queries/packing";
import { PackingTemplateItem, CATEGORIES } from "@/lib/types/packing";

interface TemplateItemsEditorProps {
  templateId: string;
  initialItems: PackingTemplateItem[];
}

export function TemplateItemsEditor({
  templateId,
  initialItems,
}: TemplateItemsEditorProps) {
  const router = useRouter();
  const [items, setItems] = useState<PackingTemplateItem[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    category: "other",
    is_essential: false,
    quantity: 1,
    notes: "",
  });

  // Group items by category
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
      const supabase = createClient();
      const item = await addTemplateItem(supabase, {
        template_id: templateId,
        name: newItem.name,
        category: newItem.category,
        is_essential: newItem.is_essential,
        quantity: newItem.quantity,
        notes: newItem.notes || undefined,
        sort_order: items.length,
      });
      setItems((prev) => [...prev, item]);
      setNewItem({
        name: "",
        category: newItem.category,
        is_essential: false,
        quantity: 1,
        notes: "",
      });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteItem(itemId: string) {
    try {
      const supabase = createClient();
      await deleteTemplateItem(supabase, itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch {
      // ignore
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

          <div className="flex items-center gap-3">
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
                  {categoryItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm">{item.name}</span>
                        {item.quantity > 1 && (
                          <span className="text-camp-earth text-xs">
                            x{item.quantity}
                          </span>
                        )}
                        {item.is_essential && (
                          <span className="text-xs bg-camp-fire/20 text-camp-fire px-1.5 py-0.5 rounded">
                            essential
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="text-camp-earth/40 hover:text-red-400 transition-colors"
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
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
