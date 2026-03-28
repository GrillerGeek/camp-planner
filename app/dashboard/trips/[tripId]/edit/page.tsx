import { createClient } from "@/lib/supabase/server";
import { getTripById, getUserRoleForTrip } from "@/lib/queries/trips";
import { redirect } from "next/navigation";
import { TripForm } from "../../components/TripForm";

export default async function EditTripPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const supabase = await createClient();

  const role = await getUserRoleForTrip(supabase, tripId);
  if (role !== "planner") {
    redirect(`/dashboard/trips/${tripId}`);
  }

  const trip = await getTripById(supabase, tripId);
  if (!trip) {
    redirect("/dashboard");
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Edit Trip</h1>
      <TripForm mode="edit" initialData={trip} />
    </div>
  );
}
