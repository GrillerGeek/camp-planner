import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getTripByShareToken } from "@/lib/queries/sharing";
import { formatDateRange } from "@/lib/utils/dates";

export default async function SharedTripPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Create a supabase client that works without auth (service role not needed
  // because RLS on trip_share_links allows anon SELECT for active tokens,
  // but trip data tables require authenticated access. We use the anon key
  // and handle via server-side fetch with service role env var if available,
  // otherwise fall back to a standard server client).
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // No-op for shared pages
      },
    },
  });

  const data = await getTripByShareToken(supabase, token);

  if (!data) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">&#128279;</div>
        <h2 className="text-xl font-semibold text-white mb-2">
          Link Expired or Invalid
        </h2>
        <p className="text-camp-earth">
          This link has expired or been revoked. Please ask the trip planner for
          a new link.
        </p>
      </div>
    );
  }

  const { trip, planner_name, meals, packing_items, tasks } = data;

  // Group meals by day
  const mealsByDay = new Map<string, typeof meals>();
  for (const meal of meals) {
    const existing = mealsByDay.get(meal.day_date) ?? [];
    existing.push(meal);
    mealsByDay.set(meal.day_date, existing);
  }
  const sortedDays = [...mealsByDay.keys()].sort();

  // Group packing items by category
  const packingByCategory = new Map<string, typeof packing_items>();
  for (const item of packing_items) {
    const existing = packingByCategory.get(item.category) ?? [];
    existing.push(item);
    packingByCategory.set(item.category, existing);
  }

  const mealTypeOrder: Record<string, number> = {
    breakfast: 0,
    lunch: 1,
    dinner: 2,
    snack: 3,
  };

  return (
    <div>
      {/* Banner */}
      <div className="bg-camp-forest/20 border border-camp-forest/30 rounded-xl p-4 mb-8">
        <p className="text-camp-forest text-sm font-medium">
          You&apos;re viewing{" "}
          <span className="text-white font-semibold">{trip.name}</span> — shared
          by {planner_name}
        </p>
      </div>

      {/* Trip Summary */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">{trip.name}</h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-camp-earth">
          <span className="flex items-center gap-1.5">
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
                d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
              />
            </svg>
            {trip.destination}
          </span>
          <span className="text-camp-earth/60">
            {formatDateRange(trip.start_date, trip.end_date)}
          </span>
          <span className="capitalize px-2 py-0.5 rounded-full text-xs bg-white/10 text-camp-earth">
            {trip.status}
          </span>
        </div>
        {trip.campsite_info && (
          <p className="text-camp-earth/50 text-sm mt-2">{trip.campsite_info}</p>
        )}
      </div>

      {/* Meal Plan */}
      <Section title="Meal Plan" icon="&#127859;">
        {meals.length === 0 ? (
          <EmptyMessage>No meals planned yet.</EmptyMessage>
        ) : (
          <div className="space-y-4">
            {sortedDays.map((day) => {
              const dayMeals = (mealsByDay.get(day) ?? []).sort(
                (a, b) =>
                  (mealTypeOrder[a.meal_type] ?? 9) -
                  (mealTypeOrder[b.meal_type] ?? 9)
              );
              return (
                <div key={day}>
                  <h4 className="text-sm font-medium text-white mb-2">
                    {new Date(day + "T00:00:00").toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })}
                  </h4>
                  <div className="space-y-1.5">
                    {dayMeals.map((meal) => (
                      <div
                        key={meal.id}
                        className="bg-white/5 rounded-lg px-3 py-2 flex items-center gap-3"
                      >
                        <span className="text-xs text-camp-earth/60 w-16 capitalize">
                          {meal.meal_type}
                        </span>
                        <span className="text-sm text-white">
                          {meal.recipe_name ?? meal.custom_meal_name ?? "TBD"}
                        </span>
                        {meal.notes && (
                          <span className="text-xs text-camp-earth/40 ml-auto">
                            {meal.notes}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Packing Items */}
      <Section title="Packing List" icon="&#127890;">
        {packing_items.length === 0 ? (
          <EmptyMessage>No packing items added yet.</EmptyMessage>
        ) : (
          <div className="space-y-4">
            {[...packingByCategory.entries()].map(([category, items]) => (
              <div key={category}>
                <h4 className="text-sm font-medium text-white mb-2 capitalize">
                  {category}
                </h4>
                <div className="space-y-1">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white/5 rounded-lg px-3 py-2 flex items-center gap-3"
                    >
                      <span
                        className={`text-sm ${
                          item.is_packed
                            ? "text-camp-earth/40 line-through"
                            : "text-white"
                        }`}
                      >
                        {item.name}
                        {item.quantity > 1 && (
                          <span className="text-camp-earth/60 ml-1">
                            x{item.quantity}
                          </span>
                        )}
                      </span>
                      {item.assigned_to_name && (
                        <span className="text-xs text-camp-sky/60 ml-auto">
                          {item.assigned_to_name}
                        </span>
                      )}
                      {item.is_packed && (
                        <span className="text-xs text-camp-forest">
                          Packed
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Tasks */}
      <Section title="Tasks" icon="&#9989;">
        {tasks.length === 0 ? (
          <EmptyMessage>No tasks assigned yet.</EmptyMessage>
        ) : (
          <div className="space-y-1.5">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="bg-white/5 rounded-lg px-3 py-2 flex items-center gap-3"
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    task.is_completed
                      ? "bg-camp-forest border-camp-forest"
                      : "border-white/20"
                  }`}
                >
                  {task.is_completed && (
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
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <span
                    className={`text-sm ${
                      task.is_completed
                        ? "text-camp-earth/40 line-through"
                        : "text-white"
                    }`}
                  >
                    {task.title}
                  </span>
                  {task.description && (
                    <p className="text-xs text-camp-earth/40 mt-0.5 truncate">
                      {task.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {task.assigned_to_name && (
                    <span className="text-xs text-camp-sky/60">
                      {task.assigned_to_name}
                    </span>
                  )}
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      task.priority === "high"
                        ? "bg-camp-fire/20 text-camp-fire"
                        : task.priority === "low"
                        ? "bg-white/5 text-camp-earth/40"
                        : "bg-white/5 text-camp-earth/60"
                    }`}
                  >
                    {task.priority}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span dangerouslySetInnerHTML={{ __html: icon }} />
        {title}
      </h3>
      {children}
    </div>
  );
}

function EmptyMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
      <p className="text-camp-earth/60 text-sm">{children}</p>
    </div>
  );
}
