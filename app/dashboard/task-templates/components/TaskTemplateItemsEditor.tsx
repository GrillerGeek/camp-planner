"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  addTaskTemplateItem,
  updateTaskTemplateItem,
  deleteTaskTemplateItem,
} from "@/lib/queries/tasks";
import { TaskTemplateItem } from "@/lib/types/tasks";

interface TaskTemplateItemsEditorProps {
  templateId: string;
  initialItems: TaskTemplateItem[];
}

export function TaskTemplateItemsEditor({
  templateId,
  initialItems,
}: TaskTemplateItemsEditorProps) {
  const [items, setItems] = useState<TaskTemplateItem[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ title: "", description: "" });
  const [editItem, setEditItem] = useState({ title: "", description: "" });

  const supabase = createClient();

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newItem.title.trim()) return;

    setLoading(true);
    try {
      const item = await addTaskTemplateItem(supabase, {
        template_id: templateId,
        title: newItem.title,
        description: newItem.description || undefined,
        sort_order: items.length,
      });
      setItems((prev) => [...prev, item]);
      setNewItem({ title: "", description: "" });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function startEdit(item: TaskTemplateItem) {
    setEditingId(item.id);
    setEditItem({
      title: item.title,
      description: item.description ?? "",
    });
  }

  async function handleSaveEdit(itemId: string) {
    if (!editItem.title.trim()) return;

    try {
      const updated = await updateTaskTemplateItem(supabase, itemId, {
        title: editItem.title.trim(),
        description: editItem.description.trim() || undefined,
      });
      setItems((prev) => prev.map((i) => (i.id === itemId ? updated : i)));
      setEditingId(null);
    } catch {
      // ignore
    }
  }

  async function handleDelete(itemId: string) {
    const prev = items;
    setItems((items) => items.filter((i) => i.id !== itemId));
    try {
      await deleteTaskTemplateItem(supabase, itemId);
    } catch {
      setItems(prev);
    }
  }

  return (
    <div>
      {/* Add Item Form */}
      <form
        onSubmit={handleAdd}
        className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4"
      >
        <div className="space-y-2">
          <input
            type="text"
            value={newItem.title}
            onChange={(e) =>
              setNewItem((prev) => ({ ...prev, title: e.target.value }))
            }
            placeholder="Task title..."
            maxLength={300}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
          />
          <input
            type="text"
            value={newItem.description}
            onChange={(e) =>
              setNewItem((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder="Description (optional)"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
          />
          <button
            type="submit"
            disabled={loading || !newItem.title.trim()}
            className="bg-camp-forest hover:bg-camp-pine disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
          >
            {loading ? "Adding..." : "Add Task"}
          </button>
        </div>
      </form>

      {/* Items List */}
      {items.length === 0 ? (
        <p className="text-camp-earth text-sm text-center py-6">
          No tasks in this template yet. Add one above.
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-white/5 rounded-lg px-3 py-2.5 group flex items-start gap-3"
            >
              {editingId === item.id ? (
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={editItem.title}
                    onChange={(e) =>
                      setEditItem((prev) => ({
                        ...prev,
                        title: e.target.value,
                      }))
                    }
                    maxLength={300}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
                  />
                  <input
                    type="text"
                    value={editItem.description}
                    onChange={(e) =>
                      setEditItem((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Description"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSaveEdit(item.id)}
                      className="bg-camp-forest hover:bg-camp-pine text-white text-xs font-medium py-1 px-3 rounded transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-camp-earth hover:text-white text-xs py-1 px-2 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-white">{item.title}</span>
                    {item.description && (
                      <p className="text-camp-earth/60 text-xs mt-0.5">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => startEdit(item)}
                      className="text-camp-earth/40 hover:text-camp-sky transition-colors p-1"
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
                      onClick={() => handleDelete(item.id)}
                      className="text-camp-earth/40 hover:text-red-400 transition-colors p-1"
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
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
