"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  addPackingItem,
  togglePacked,
  deletePackingItem,
  updatePackingItem,
  applyPackingTemplate,
  getOrCreateTripPackingList,
  getPackingTemplates,
} from "@/lib/queries/packing";
import {
  TripPackingItem,
  TripPackingListWithItems,
  CATEGORIES,
  PackingTemplate,
} from "@/lib/types/packing";
import { Trip } from "@/lib/types/trip";

interface PackingListClientProps {
  tripId: string;
  trip: Trip;
  isPlanner: boolean;
  currentUserId: string | null;
  initialPackingList: TripPackingListWithItems | null;
  members: { user_id: string; display_name: string; role: string }[];
}

export function PackingListClient({
  tripId,
  trip,
  isPlanner,
  currentUserId,
  initialPackingList,
  members,
}: PackingListClientProps) {
  const [packingList, setPackingList] =
    useState<TripPackingListWithItems | null>(initialPackingList);
  const [items, setItems] = useState<TripPackingItem[]>(
    initialPackingList?.trip_packing_items ?? []
  );
  const [loading, setLoading] = useState(false);
  const [filterMember, setFilterMember] = useState<string>("all");
  const [newItem, setNewItem] = useState({
    name: "",
    category: "other",
    quantity: 1,
  });
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templates, setTemplates] = useState<
    (PackingTemplate & { item_count: number })[]
  >([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(
    null
  );

  const supabase = createClient();

  // Realtime subscription for packing items
  const packingListId = packingList?.id;
  useEffect(() => {
    if (!packingListId) return;

    const channel = supabase
      .channel(`packing-${packingListId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trip_packing_items",
          filter: `packing_list_id=eq.${packingListId}`,
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
  }, [packingListId, supabase]);

  // Load + show templates
  async function handleShowTemplates() {
    setShowTemplateModal(true);
    setTemplateLoading(true);
    try {
      const tmpl = await getPackingTemplates(supabase);
      setTemplates(tmpl);
    } catch {
      setTemplates([]);
    } finally {
      setTemplateLoading(false);
    }
  }

  async function handleApplyTemplate(templateId: string) {
    setApplyingTemplateId(templateId);
    try {
      const result = await applyPackingTemplate(supabase, tripId, templateId);
      setPackingList(result);
      setItems(result.trip_packing_items ?? []);
      setShowTemplateModal(false);
    } catch {
      // ignore
    } finally {
      setApplyingTemplateId(null);
    }
  }

  // Derive season from trip dates so we can mark season-matching templates.
  const tripSeasons = (() => {
    function s(d: string) {
      const m = new Date(d + "T00:00:00").getMonth() + 1;
      if (m >= 3 && m <= 5) return "spring";
      if (m >= 6 && m <= 8) return "summer";
      if (m >= 9 && m <= 11) return "fall";
      return "winter";
    }
    return Array.from(new Set([s(trip.start_date), s(trip.end_date)]));
  })();

  // SPEC-004b.2: rank templates so recommended ones surface first.
  // - "Recommended": matches BOTH the trip's season AND its trip_type
  // - "Match": matches one of the two
  // - "Other": matches neither
  // Within the same tier, preserve the load order (template.updated_at
  // desc) — getPackingTemplates already sorts that way.
  const sortedTemplates = templates
    .map((template) => {
      const seasonMatch = template.seasons.some((s) => tripSeasons.includes(s));
      const typeMatch =
        trip.trip_type !== null &&
        template.trip_types.includes(trip.trip_type);
      const isRecommended = seasonMatch && typeMatch;
      const score = isRecommended ? 2 : seasonMatch || typeMatch ? 1 : 0;
      return { template, seasonMatch, typeMatch, isRecommended, score };
    })
    .sort((a, b) => b.score - a.score);

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

  // Toggle a single assignee on/off for an item. Optimistic with revert.
  async function handleToggleAssignee(itemId: string, userId: string) {
    const prev = items;
    setItems((current) =>
      current.map((i) => {
        if (i.id !== itemId) return i;
        const has = i.assignees.includes(userId);
        return {
          ...i,
          assignees: has
            ? i.assignees.filter((id) => id !== userId)
            : [...i.assignees, userId],
        };
      })
    );
    try {
      const next = items.find((i) => i.id === itemId);
      if (!next) return;
      const updated = next.assignees.includes(userId)
        ? next.assignees.filter((id) => id !== userId)
        : [...next.assignees, userId];
      await updatePackingItem(supabase, itemId, { assignees: updated });
    } catch {
      setItems(prev);
    }
  }

  // Filter items
  const filteredItems =
    filterMember === "all"
      ? items
      : filterMember === "unassigned"
      ? items.filter((i) => i.assignees.length === 0)
      : items.filter((i) => i.assignees.includes(filterMember));

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
        {isPlanner && (
          <button
            onClick={handleShowTemplates}
            className="bg-camp-sky hover:bg-camp-sky/80 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
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
                d="M9 3.75H6.912a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859M12 3v8.25m0 0-3-3m3 3 3-3"
              />
            </svg>
            Apply template
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
                      title={formatPackedTooltip(item, members)}
                      className={`flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2.5 group transition-colors ${
                        item.is_packed ? "opacity-60" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={() =>
                          handleTogglePacked(item.id, item.is_packed)
                        }
                        disabled={
                          !isPlanner &&
                          (!currentUserId ||
                            !item.assignees.includes(currentUserId))
                        }
                        title={
                          !isPlanner &&
                          (!currentUserId ||
                            !item.assignees.includes(currentUserId))
                            ? "Only an assignee or a planner can mark this packed"
                            : undefined
                        }
                        className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                          item.is_packed
                            ? "bg-camp-forest border-camp-forest"
                            : "border-white/30 hover:border-camp-forest"
                        } ${
                          !isPlanner &&
                          (!currentUserId ||
                            !item.assignees.includes(currentUserId))
                            ? "cursor-not-allowed opacity-60"
                            : ""
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
                        {item.is_essential && (
                          <span
                            className="text-[10px] uppercase tracking-wider ml-1.5 px-1.5 py-0.5 rounded bg-camp-fire/15 text-camp-fire border border-camp-fire/30"
                            title="Marked essential"
                          >
                            essential
                          </span>
                        )}
                        {item.notes && (
                          <p className="text-camp-earth/60 text-xs mt-0.5 truncate">
                            {item.notes}
                          </p>
                        )}
                      </div>

                      {/* Assignment — toggle-chip per member for planners,
                          read-only name list for everyone else */}
                      {isPlanner && members.length > 1 ? (
                        <div className="flex flex-wrap gap-1 max-w-[200px] justify-end shrink-0">
                          {members.map((m) => {
                            const assigned = item.assignees.includes(m.user_id);
                            const firstName =
                              m.display_name.split(/\s+/)[0] ?? m.display_name;
                            return (
                              <button
                                key={m.user_id}
                                onClick={() =>
                                  handleToggleAssignee(item.id, m.user_id)
                                }
                                title={
                                  assigned
                                    ? `Unassign ${m.display_name}`
                                    : `Assign ${m.display_name}`
                                }
                                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                  assigned
                                    ? "bg-camp-forest/25 border-camp-forest/60 text-camp-forest"
                                    : "border-white/10 text-camp-earth/50 hover:text-camp-earth hover:border-white/20"
                                }`}
                              >
                                {firstName}
                              </button>
                            );
                          })}
                        </div>
                      ) : item.assignees.length > 0 ? (
                        <span className="text-xs text-camp-earth/60 shrink-0">
                          {item.assignees
                            .map(
                              (id) =>
                                members.find((m) => m.user_id === id)
                                  ?.display_name ?? "?"
                            )
                            .join(", ")}
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

      {/* Template picker modal */}
      {showTemplateModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => !applyingTemplateId && setShowTemplateModal(false)}
        >
          <div
            className="bg-camp-night border border-white/10 rounded-xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold text-white">
                Apply packing template
              </h3>
              <button
                onClick={() => setShowTemplateModal(false)}
                disabled={!!applyingTemplateId}
                className="text-camp-earth hover:text-white transition-colors disabled:opacity-50"
                aria-label="Close"
              >
                <svg
                  className="w-5 h-5"
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
            <p className="text-camp-earth/70 text-xs mb-4">
              Items merge with what you already have. Duplicates are skipped.
            </p>

            {templateLoading ? (
              <div className="text-center py-8 text-camp-earth text-sm">
                Loading templates...
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 text-camp-earth text-sm">
                No packing templates yet. Create one from the Packing Templates page.
              </div>
            ) : (
              <div className="space-y-2">
                {sortedTemplates.map(
                  ({ template, seasonMatch, typeMatch, isRecommended }) => {
                    const isApplying = applyingTemplateId === template.id;
                    return (
                      <button
                        key={template.id}
                        onClick={() => handleApplyTemplate(template.id)}
                        disabled={!!applyingTemplateId}
                        className={`w-full text-left bg-white/5 border rounded-lg p-3 hover:border-white/20 transition-colors disabled:opacity-50 ${
                          isRecommended
                            ? "border-camp-forest/50"
                            : seasonMatch || typeMatch
                              ? "border-camp-sky/40"
                              : "border-white/10"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-white font-medium text-sm truncate">
                              {template.name}
                            </span>
                            {isRecommended && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-camp-forest/30 text-camp-forest font-medium shrink-0">
                                Recommended
                              </span>
                            )}
                          </div>
                          <span className="text-camp-earth/70 text-xs shrink-0">
                            {isApplying
                              ? "Applying..."
                              : `${template.item_count} item${
                                  template.item_count !== 1 ? "s" : ""
                                }`}
                          </span>
                        </div>
                        {template.description && (
                          <p className="text-camp-earth/60 text-xs mb-2 line-clamp-2">
                            {template.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {template.seasons.map((s) => (
                            <span
                              key={s}
                              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                tripSeasons.includes(s)
                                  ? "bg-camp-sky/30 text-camp-sky"
                                  : "bg-white/10 text-camp-earth/70"
                              }`}
                            >
                              {s}
                            </span>
                          ))}
                          {template.trip_types.map((t) => (
                            <span
                              key={t}
                              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                trip.trip_type && t === trip.trip_type
                                  ? "bg-camp-fire/30 text-camp-fire"
                                  : "bg-camp-fire/10 text-camp-fire/70"
                              }`}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * SPEC-004b.3 — tooltip showing who packed this item and when.
 * Returns undefined when the item isn't packed (so the title attribute
 * is omitted entirely rather than rendering an empty tooltip).
 */
function formatPackedTooltip(
  item: { is_packed: boolean; packed_at: string | null; packed_by: string | null },
  members: { user_id: string; display_name: string }[]
): string | undefined {
  if (!item.is_packed || !item.packed_at) return undefined;
  const packer =
    members.find((m) => m.user_id === item.packed_by)?.display_name ??
    (item.packed_by ? "a trip member" : null);
  const when = new Date(item.packed_at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return packer ? `Packed by ${packer} · ${when}` : `Packed · ${when}`;
}
