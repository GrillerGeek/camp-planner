"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  generateGroceryListFromMeals,
  addGroceryItem,
  togglePurchased,
  deleteGroceryItem,
  getReconciliationData,
  applyReconciliation,
  ReconciliationItem,
} from "@/lib/queries/grocery";
import {
  GroceryItem,
  GroceryListWithItems,
  GROCERY_CATEGORIES,
} from "@/lib/types/inventory";
import { Trip } from "@/lib/types/trip";

interface GroceryListClientProps {
  tripId: string;
  trip: Trip;
  isPlanner: boolean;
  initialGroceryList: GroceryListWithItems | null;
}

export function GroceryListClient({
  tripId,
  trip,
  isPlanner,
  initialGroceryList,
}: GroceryListClientProps) {
  const [groceryList, setGroceryList] =
    useState<GroceryListWithItems | null>(initialGroceryList);
  const [items, setItems] = useState<GroceryItem[]>(
    initialGroceryList?.trip_grocery_items ?? []
  );
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    quantity: 1,
    unit: "",
    category: "Other",
  });
  const [showReconcile, setShowReconcile] = useState(false);
  const [reconcileData, setReconcileData] = useState<ReconciliationItem[]>([]);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [reconcileAdjustments, setReconcileAdjustments] = useState<
    Record<string, number>
  >({});

  const supabase = createClient();

  // Realtime subscription
  useEffect(() => {
    if (!groceryList) return;

    const channel = supabase
      .channel(`grocery-${groceryList.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trip_grocery_items",
          filter: `grocery_list_id=eq.${groceryList.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setItems((prev) => {
              if (
                prev.some((i) => i.id === (payload.new as GroceryItem).id)
              )
                return prev;
              return [...prev, payload.new as GroceryItem];
            });
          } else if (payload.eventType === "UPDATE") {
            setItems((prev) =>
              prev.map((i) =>
                i.id === (payload.new as GroceryItem).id
                  ? (payload.new as GroceryItem)
                  : i
              )
            );
          } else if (payload.eventType === "DELETE") {
            setItems((prev) =>
              prev.filter(
                (i) => i.id !== (payload.old as { id: string }).id
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groceryList?.id, supabase]);

  // Generate from meals
  async function handleGenerate() {
    setGenerating(true);
    try {
      const result = await generateGroceryListFromMeals(supabase, tripId);
      setGroceryList(result);
      setItems(result.trip_grocery_items ?? []);
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  }

  // Add manual item
  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newItem.name.trim()) return;

    setLoading(true);
    try {
      const item = await addGroceryItem(supabase, tripId, {
        name: newItem.name,
        quantity: newItem.quantity,
        unit: newItem.unit || undefined,
        category: newItem.category,
      });
      setItems((prev) => [...prev, item]);
      if (!groceryList) {
        // Refetch to get the list
        const { data } = await supabase
          .from("trip_grocery_lists")
          .select("*, trip_grocery_items(*)")
          .eq("trip_id", tripId)
          .single();
        if (data) {
          setGroceryList(data);
          setItems(data.trip_grocery_items ?? []);
        }
      }
      setNewItem({ name: "", quantity: 1, unit: "", category: "Other" });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  // Toggle purchased
  async function handleTogglePurchased(
    itemId: string,
    currentPurchased: boolean
  ) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, is_purchased: !currentPurchased } : i
      )
    );
    try {
      await togglePurchased(supabase, itemId, !currentPurchased);
    } catch {
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId ? { ...i, is_purchased: currentPurchased } : i
        )
      );
    }
  }

  // Delete item
  async function handleDeleteItem(itemId: string) {
    const prev = items;
    setItems((items) => items.filter((i) => i.id !== itemId));
    try {
      await deleteGroceryItem(supabase, itemId);
    } catch {
      setItems(prev);
    }
  }

  // Reconciliation
  async function handleStartReconcile() {
    setReconcileLoading(true);
    try {
      const data = await getReconciliationData(supabase, tripId);
      setReconcileData(data);
      const adjustments: Record<string, number> = {};
      data.forEach((item) => {
        if (item.inventoryItemId) {
          adjustments[item.inventoryItemId] = Math.max(
            0,
            item.currentInventoryQty - item.deductQty
          );
        }
      });
      setReconcileAdjustments(adjustments);
      setShowReconcile(true);
    } catch {
      // ignore
    } finally {
      setReconcileLoading(false);
    }
  }

  async function handleApplyReconcile() {
    setReconcileLoading(true);
    try {
      const updates: { inventoryItemId: string; newQuantity: number }[] = [];
      const deletions: string[] = [];

      for (const [id, qty] of Object.entries(reconcileAdjustments)) {
        if (qty <= 0) {
          deletions.push(id);
        } else {
          updates.push({ inventoryItemId: id, newQuantity: qty });
        }
      }

      await applyReconciliation(supabase, updates, deletions);
      setShowReconcile(false);
      setReconcileData([]);
    } catch {
      // ignore
    } finally {
      setReconcileLoading(false);
    }
  }

  // Group by category
  const grouped = items.reduce<Record<string, GroceryItem[]>>((acc, item) => {
    const cat = item.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  // Progress
  const purchased = items.filter((i) => i.is_purchased).length;
  const total = items.length;
  const percentage = total > 0 ? Math.round((purchased / total) * 100) : 0;
  const isComplete = total > 0 && purchased === total;

  return (
    <div>
      {/* Progress Bar */}
      {total > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-medium">
              {isComplete ? "Shopping Complete!" : "Shopping Progress"}
            </span>
            <span className="text-camp-earth text-sm">
              {purchased}/{total} items purchased ({percentage}%)
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${
                isComplete ? "bg-camp-forest" : "bg-camp-sky"
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
            onClick={handleGenerate}
            disabled={generating}
            className="bg-camp-sky hover:bg-camp-sky/80 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
          >
            {generating ? (
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
            {items.length > 0 ? "Regenerate from Meals" : "Generate from Meals"}
          </button>
        )}

        {isPlanner && trip.status === "completed" && (
          <button
            onClick={handleStartReconcile}
            disabled={reconcileLoading}
            className="bg-camp-fire hover:bg-camp-fire/80 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
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
                d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3"
              />
            </svg>
            Reconcile Inventory
          </button>
        )}
      </div>

      {/* Reconciliation Panel */}
      {showReconcile && (
        <div className="bg-white/5 border border-camp-fire/30 rounded-xl p-4 mb-6">
          <h3 className="text-white font-medium mb-3">
            Post-Trip Inventory Reconciliation
          </h3>
          <p className="text-camp-earth text-sm mb-4">
            Review purchased items and adjust your camper inventory. Items
            reduced to 0 will be removed.
          </p>
          {reconcileData.length === 0 ? (
            <p className="text-camp-earth text-sm">
              No purchased items to reconcile.
            </p>
          ) : (
            <div className="space-y-2 mb-4">
              {reconcileData.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-white">
                      {item.groceryItemName}
                    </span>
                    <span className="text-camp-earth text-xs ml-2">
                      Purchased: {item.quantity}
                      {item.unit ? ` ${item.unit}` : ""}
                    </span>
                    {item.inventoryItemId && (
                      <span className="text-camp-earth/60 text-xs ml-2">
                        Current inventory: {item.currentInventoryQty}
                      </span>
                    )}
                  </div>
                  {item.inventoryItemId && (
                    <div className="flex items-center gap-2">
                      <label className="text-camp-earth text-xs">
                        New qty:
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={
                          reconcileAdjustments[item.inventoryItemId] ?? 0
                        }
                        onChange={(e) =>
                          setReconcileAdjustments((prev) => ({
                            ...prev,
                            [item.inventoryItemId!]: Math.max(
                              0,
                              parseFloat(e.target.value) || 0
                            ),
                          }))
                        }
                        className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
                      />
                    </div>
                  )}
                  {!item.inventoryItemId && (
                    <span className="text-camp-earth/40 text-xs">
                      Not in inventory
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleApplyReconcile}
              disabled={reconcileLoading || reconcileData.length === 0}
              className="bg-camp-forest hover:bg-camp-pine disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {reconcileLoading ? "Applying..." : "Apply Changes"}
            </button>
            <button
              onClick={() => setShowReconcile(false)}
              className="text-camp-earth hover:text-white text-sm py-2 px-4 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add Manual Item Form */}
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
              placeholder="Add a grocery item..."
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
            />
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
              className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
            />
            <input
              type="text"
              value={newItem.unit}
              onChange={(e) =>
                setNewItem((prev) => ({ ...prev, unit: e.target.value }))
              }
              placeholder="Unit"
              className="w-24 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-camp-earth/50 focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
            />
            <select
              value={newItem.category}
              onChange={(e) =>
                setNewItem((prev) => ({ ...prev, category: e.target.value }))
              }
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-camp-forest focus:border-transparent"
            >
              {GROCERY_CATEGORIES.map((cat) => (
                <option key={cat} value={cat} className="bg-camp-night">
                  {cat}
                </option>
              ))}
            </select>
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
          <div className="text-5xl mb-4">🛒</div>
          <h2 className="text-lg font-semibold text-white mb-2">
            No grocery items yet
          </h2>
          <p className="text-camp-earth text-sm max-w-sm mx-auto">
            {isPlanner
              ? "Generate a list from your meal plan or add items manually."
              : "The trip planner hasn't created a grocery list yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, categoryItems]) => (
              <div key={category}>
                <h3 className="text-sm font-medium text-camp-earth uppercase tracking-wider mb-2">
                  {category} (
                  {categoryItems.filter((i) => i.is_purchased).length}/
                  {categoryItems.length})
                </h3>
                <div className="space-y-1">
                  {categoryItems.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2.5 group transition-colors ${
                        item.is_purchased ? "opacity-60" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={() =>
                          handleTogglePurchased(item.id, item.is_purchased)
                        }
                        className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                          item.is_purchased
                            ? "bg-camp-forest border-camp-forest"
                            : "border-white/30 hover:border-camp-forest"
                        }`}
                      >
                        {item.is_purchased && (
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
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm ${
                              item.is_purchased
                                ? "text-camp-earth line-through"
                                : "text-white"
                            }`}
                          >
                            {item.name}
                          </span>
                          {item.is_manual && (
                            <span className="text-xs bg-white/10 text-camp-earth px-1.5 py-0.5 rounded">
                              manual
                            </span>
                          )}
                          {!item.is_manual && (
                            <span className="text-xs bg-camp-sky/20 text-camp-sky px-1.5 py-0.5 rounded">
                              auto
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-camp-earth text-xs">
                            {item.quantity}
                            {item.unit ? ` ${item.unit}` : ""}
                          </span>
                          {item.source_recipe && (
                            <span className="text-camp-earth/40 text-xs truncate">
                              From: {item.source_recipe}
                            </span>
                          )}
                        </div>
                      </div>

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
