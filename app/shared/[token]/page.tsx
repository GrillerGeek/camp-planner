import { createServerClient } from "@supabase/ssr";
import type { Metadata } from "next";
import { getSharedTripByToken } from "@/lib/queries/sharing";
import { formatDateRange } from "@/lib/utils/dates";

// Anonymous Supabase client — the anon key only, no service role. All data
// access flows through the public.get_shared_trip RPC which enforces the
// scoped read via its SECURITY DEFINER body.
function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        /* guest page never sets cookies */
      },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const supabase = createAnonClient();
  const data = await getSharedTripByToken(supabase, token);
  if (!data) {
    return { title: "Shared trip" };
  }
  return { title: `Trip: ${data.trip.name}` };
}

export default async function SharedTripPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createAnonClient();
  const data = await getSharedTripByToken(supabase, token);

  if (!data) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-white mb-2">
          This link is no longer valid
        </h2>
        <p className="text-camp-earth">
          The trip planner may have revoked it. Ask them for a new link.
        </p>
      </div>
    );
  }

  const { trip, planner_name, reservations, meals, packing_items, tasks } =
    data;

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
      <div className="bg-camp-forest/20 border border-camp-forest/30 rounded-xl p-4 mb-8">
        <p className="text-camp-forest text-sm font-medium">
          You&apos;re viewing{" "}
          <span className="text-white font-semibold">{trip.name}</span> — shared
          by {planner_name}
        </p>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">{trip.name}</h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-camp-earth">
          <span>{trip.destination}</span>
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

      <Section title="Reservations">
        {reservations.length === 0 ? (
          <EmptyMessage>No reservations listed.</EmptyMessage>
        ) : (
          <div className="space-y-2">
            {reservations.map((r) => (
              <div
                key={r.id}
                className="bg-white/5 rounded-lg px-3 py-2 text-sm"
              >
                <div className="text-white font-medium">{r.campground_name}</div>
                <div className="text-camp-earth/60 text-xs">
                  {r.site_number && <>Site {r.site_number} · </>}
                  {r.check_in_date && r.check_out_date
                    ? formatDateRange(r.check_in_date, r.check_out_date)
                    : null}
                </div>
                {r.notes && (
                  <div className="text-camp-earth/50 text-xs mt-1">
                    {r.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Meal Plan">
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
                          {meal.recipe_name ??
                            meal.custom_meal_name ??
                            "TBD"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Packing (assigned items only)">
        {packing_items.length === 0 ? (
          <EmptyMessage>Nothing assigned to guests.</EmptyMessage>
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
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Tasks (assigned only)">
        {tasks.length === 0 ? (
          <EmptyMessage>No tasks assigned to guests.</EmptyMessage>
        ) : (
          <div className="space-y-1.5">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="bg-white/5 rounded-lg px-3 py-2 flex items-center gap-3"
              >
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
                </div>
                {task.assigned_to_name && (
                  <span className="text-xs text-camp-sky/60 shrink-0">
                    {task.assigned_to_name}
                  </span>
                )}
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
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
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
