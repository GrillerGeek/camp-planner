"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  addPackingItem,
  togglePacked,
  deletePackingItem,
  updatePackingItem,
  autoPopulateFromTemplates,
  getOrCreateTripPackingList,
} from "@/lib/queries/packing";
import {
  TripPackingItem,
  TripPackingListWithItems,
  CATEGORIES,
} from "@/lib/types/packing";
import { Trip } from "@/lib/types/trip";

interface PackingListClientProps {
  tripId: string;
  trip: Trip;
  isPlanner: boolean;
  initialPackingList: TripPackingListWithItems | null;
  members: { user_id: string; display_name: string; role: string }[];
}

export function PackingListClient({
  tripId,
  trip,
  isPlanner,
  initialPackingList,
  members,
}: PackingListClientProps) {
  const [packingList, setPackingList] =
    useState<TripPackingListWithItems | null>(initialPackingList);
  const [items, setItems] = useState<TripPackingItem[]>(
    initialPackingList?.trip_packing_items ?? []
  );
  const [loading, setLoading] = useState(false);
  const [autoPopLoading, setAutoPopLoading] = useState(false);
  const [filterMember, setFilterMember] = useState<string>("all");
  const [newItem, setNewItem] = useState({
    name: "",
    category: "other",
    quantity: 1,
  });

  const supabase = createClient();

  // Realtime subscription for packing items
  useEffect(() => {
    if (!packingList) return;

    const channel = supabase
      .channel(`packing-${packingList.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trip_packing_items",
          filter: `packing_list_id=eq.${packingList.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setItems((prev) => {
              // Avoid duplicates from optimistic updates
              if (prev.some((i) => i.id === (payload.new as TripPackingItem).id))
                return prev;
              return [...prev, payload.new as TripPackingItem];
            });
          } else if (payload.eventType === "UPDATE") {
            setItems((prev) =>
              prev.map((i) =>
                i.id === (payload.new as TripPackingItem).id
                  ? (payload.new as TripPackingItem)
                  : i
              )
            );
          } else if (payload.eventType === "DELETE") {
            setItems((prev) =>
              prev.filter((i) => i.id !== (payload.old as { id: string }).id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [packingList?.id]);

  // Auto-populate from templates
  async function handleAutoPopulate() {
    setAutoPopLoading(true);
    try {
      const result = await autoPopulateFromTemplates(
        supabase,
        tripId,
        trip.start_date,
        trip.end_date
      );
      setPackingList(result);
      setItems(result.trip_packing_items ?? []);
    } catch {
      // ignore
    } finally {
      setAutoPopLoading(false);
    }
  }

  // Add new item
  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newItem.name.trim()) return;

    setLoading(true);
    try {
      // Ensure packing list exists
      let listId = packingList?.id;
      if (!listId) {
        const list = await getOrCreateTripPackingList(supabase, tripId);
        setPackingList({
          ...list,
          trip_packing_items: [],
        });
        listId = list.id;
      }

      const item = await addPackingItem(supabase, {
        packing_list_id: listId,
        name: newItem.name,
        category: newItem.category,
        quantity: newItem.quantity,
        sort_order: items.length,
      });

      // Optimistic update
      setItems((prev) => [...prev, item]);
      setNewItem({ name: "", category: newItem.category, quantity: 1 });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  // Toggle packed status
  async function handleTogglePacked(itemId: string, currentPacked: boolean) {
    // Optimistic update
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, is_packed: !currentPacked } : i
      )
    );

    try {
      await togglePacked(supabase, itemId, !currentPacked);
    } catch {
      // Revert on error
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId ? { ...i, is_packed: currentPacked } : i
        )
      );
    }
  }

  // Delete item
  async function handleDeleteItem(itemId: string) {
    const prev = items;
    setItems((items) => items.filter((i) => i.id !== itemId));
    try {
      await deletePackingItem(supabase, itemId);
    } catch {
      setItems(prev);
    }
  }

  // Assign item
  async function handleAssign(itemId: string, userId: string | null) {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, assigned_to: userId } : i))
    );
    try {
      await updatePackingItem(supabase, itemId, { assigned_to: userId });
    } catch {
      // ignore
    }
  }

  // Filter items
  const filteredItems =
    filterMember === "all"
      ? items
      : filterMember === "unassigned"
      ? items.filter((i) => !i.assigned_to)
      : items.filter((i) => i.assigned_to === filterMember);

  // Group by category
  const grouped = filteredItems.reduce<Record<string, TripPackingItem[]>>(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    },
    {}
  );

  // Progress
  const packed = items.filter((i) => i.is_packed).length;
  const total = items.length;
  const percentage = total > 0 ? Math.round((packed / total) * 100) : 0;

  return (
    <div>
      {/* Progress Bar */}
      {total > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-medium">Packing Progress</span>
            <span className="text-camp-earth text-sm">
              {packed}/{total} items packed ({percentage}%)
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${
                percentage === 100 ? "bg-camp-forest" : "bg-camp-sky"
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {isPlanner && total === 0 && (
          <button
            onClick={handleAutoPopulate}
            disabled={autoPopLoading}
            className="bg-camp-sky hover:bg-camp-sky/80 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
          >
            {autoPopLoading ? (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
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
                  d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z"
                />
              </svg>
            )}
            Auto-populate from templates
          </button>
        )}

        {members.length > 1 && (
          <select
            value={filterMember}
            onChange={(e) => setFilterMember(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
          >
            <option value="all" className="bg-camp-night">
              All members
            </option>
            <option value="unassigned" className="bg-camp-night">
              Unassigned
            </option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id} className="bg-camp-night">
                {m.display_name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Add Item Form */}
      {isPlanner && (
        <form
          onSubmit={handleAddItem}
          className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6"
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={newItem.name}
              onChange={(e) =>
                setNewItem((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Add a packing item..."
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
              className="w-16 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
            />
            <button
              type="submit"
              disabled={loading || !newItem.name.trim()}
              className="bg-camp-forest hover:bg-camp-pine disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors whitespace-nowrap"
            >
              {loading ? "Adding..." : "Add"}
            </button>
          </div>
        </form>
      )}

      {/* Items List */}
      {total === 0 ? (
        <div className="text-center py-12">
          <div className="text-5xl mb-4">🎒</div>
          <h2 className="text-lg font-semibold text-white mb-2">
            No packing items yet
          </h2>
          <p className="text-camp-earth text-sm max-w-sm mx-auto">
            {isPlanner
              ? "Add items manually or auto-populate from your templates."
              : "The trip planner hasn't added packing items yet."}
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
                  {category} ({categoryItems.filter((i) => i.is_packed).length}/
                  {categoryItems.length})
                </h3>
                <div className="space-y-1">
                  {categoryItems.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2.5 group transition-colors ${
                        item.is_packed ? "opacity-60" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={() =>
                          handleTogglePacked(item.id, item.is_packed)
                        }
                        className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                          item.is_packed
                            ? "bg-camp-forest border-camp-forest"
                            : "border-white/30 hover:border-camp-forest"
                        }`}
                      >
                        {item.is_packed && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="m4.5 12.75 6 6 9-13.5"
                            />
                          </svg>
                        )}
                      </button>

                      {/* Item Info */}
                      <div className="flex-1 min-w-0">
                        <span
                          className={`text-sm ${
                            item.is_packed
                              ? "text-camp-earth line-through"
                              : "text-white"
                          }`}
                        >
                          {item.name}
                        </span>
                        {item.quantity > 1 && (
                          <span className="text-camp-earth text-xs ml-1.5">
                            x{item.quantity}
                          </span>
                        )}
                        {item.notes && (
                          <p className="text-camp-earth/60 text-xs mt-0.5 truncate">
                            {item.notes}
                          </p>
                        )}
                      </div>

                      {/* Assignment */}
                      {isPlanner && members.length > 1 ? (
                        <select
                          value={item.assigned_to ?? ""}
                          onChange={(e) =>
                            handleAssign(
                              item.id,
                              e.target.value || null
                            )
                          }
                          className="bg-transparent border border-white/10 rounded px-2 py-1 text-xs text-camp-earth focus:outline-none focus:ring-1 focus:ring-camp-forest max-w-[120px] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                        >
                          <option value="" className="bg-camp-night">
                            Unassigned
                          </option>
                          {members.map((m) => (
                            <option
                              key={m.user_id}
                              value={m.user_id}
                              className="bg-camp-night"
                            >
                              {m.display_name}
                            </option>
                          ))}
                        </select>
                      ) : item.assigned_to ? (
                        <span className="text-xs text-camp-earth/60">
                          {members.find((m) => m.user_id === item.assigned_to)
                            ?.display_name ?? "Assigned"}
                        </span>
                      ) : null}

                      {/* Delete */}
                      {isPlanner && (
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="text-camp-earth/30 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
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
                      )}
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
