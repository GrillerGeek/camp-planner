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
  const [newItem, setNewItem] = useState<{
    title: string;
    description: string;
    relative_due_days: string;
    priority: "low" | "medium" | "high";
  }>({
    title: "",
    description: "",
    relative_due_days: "",
    priority: "medium",
  });
  const [editItem, setEditItem] = useState<{
    title: string;
    description: string;
    relative_due_days: string;
    priority: "low" | "medium" | "high";
  }>({
    title: "",
    description: "",
    relative_due_days: "",
    priority: "medium",
  });

  const supabase = createClient();

  function parseRelativeDays(input: string): number | null {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const n = parseInt(trimmed, 10);
    return Number.isFinite(n) ? n : null;
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newItem.title.trim()) return;

    setLoading(true);
    try {
      const item = await addTaskTemplateItem(supabase, {
        template_id: templateId,
        title: newItem.title,
        description: newItem.description || undefined,
        relative_due_days: parseRelativeDays(newItem.relative_due_days),
        priority: newItem.priority,
        sort_order: items.length,
      });
      setItems((prev) => [...prev, item]);
      setNewItem({
        title: "",
        description: "",
        relative_due_days: "",
        // preserve priority between adds for quick "all high" entry
        priority: newItem.priority,
      });
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
      relative_due_days:
        item.relative_due_days != null ? String(item.relative_due_days) : "",
      priority: item.priority,
    });
  }

  async function handleSaveEdit(itemId: string) {
    if (!editItem.title.trim()) return;

    try {
      const updated = await updateTaskTemplateItem(supabase, itemId, {
        title: editItem.title.trim(),
        description: editItem.description.trim() || undefined,
        relative_due_days: parseRelativeDays(editItem.relative_due_days),
        priority: editItem.priority,
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
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-camp-earth text-xs flex items-center gap-1.5">
              Days from trip start:
              <input
                type="number"
                value={newItem.relative_due_days}
                onChange={(e) =>
                  setNewItem((prev) => ({
                    ...prev,
                    relative_due_days: e.target.value,
                  }))
                }
                placeholder="e.g. -7"
                className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder-camp-earth/30 focus:outline-none focus:ring-1 focus:ring-camp-forest"
              />
              <span className="text-camp-earth/70 text-[10px]">
                (neg = before, blank = no due date)
              </span>
            </label>
            <label className="text-camp-earth text-xs flex items-center gap-1.5">
              Priority:
              <select
                value={newItem.priority}
                onChange={(e) =>
                  setNewItem((prev) => ({
                    ...prev,
                    priority: e.target.value as "low" | "medium" | "high",
                  }))
                }
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-camp-forest"
              >
                <option value="low" className="bg-camp-night">low</option>
                <option value="medium" className="bg-camp-night">medium</option>
                <option value="high" className="bg-camp-night">high</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={loading || !newItem.title.trim()}
              className="ml-auto bg-camp-forest hover:bg-camp-pine disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {loading ? "Adding..." : "Add Task"}
            </button>
          </div>
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
                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="text-camp-earth text-xs flex items-center gap-1.5">
                      Days:
                      <input
                        type="number"
                        value={editItem.relative_due_days}
                        onChange={(e) =>
                          setEditItem((prev) => ({
                            ...prev,
                            relative_due_days: e.target.value,
                          }))
                        }
                        placeholder="e.g. -7"
                        className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder-camp-earth/30 focus:outline-none focus:ring-1 focus:ring-camp-forest"
                      />
                    </label>
                    <label className="text-camp-earth text-xs flex items-center gap-1.5">
                      Priority:
                      <select
                        value={editItem.priority}
                        onChange={(e) =>
                          setEditItem((prev) => ({
                            ...prev,
                            priority: e.target.value as
                              | "low"
                              | "medium"
                              | "high",
                          }))
                        }
                        className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-camp-forest"
                      >
                        <option value="low" className="bg-camp-night">low</option>
                        <option value="medium" className="bg-camp-night">medium</option>
                        <option value="high" className="bg-camp-night">high</option>
                      </select>
                    </label>
                    <div className="ml-auto flex gap-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-camp-earth hover:text-white text-xs py-1 px-2 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(item.id)}
                        className="bg-camp-forest hover:bg-camp-pine text-white text-xs font-medium py-1 px-3 rounded transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-white">{item.title}</span>
                      {item.priority !== "medium" && (
                        <span
                          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            item.priority === "high"
                              ? "bg-camp-fire/15 text-camp-fire"
                              : "bg-white/10 text-camp-earth/80"
                          }`}
                        >
                          {item.priority}
                        </span>
                      )}
                      {item.relative_due_days != null && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-camp-sky/15 text-camp-sky">
                          {item.relative_due_days === 0
                            ? "day-of"
                            : item.relative_due_days < 0
                            ? `${Math.abs(item.relative_due_days)}d before`
                            : `${item.relative_due_days}d after`}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-camp-earth/70 text-xs mt-0.5">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => startEdit(item)}
                      className="text-camp-earth/60 hover:text-camp-sky transition-colors p-1"
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
                      className="text-camp-earth/60 hover:text-red-400 transition-colors p-1"
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
