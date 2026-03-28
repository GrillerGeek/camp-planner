import { TripForm } from "../components/TripForm";

export default function NewTripPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Plan a New Trip</h1>
      <TripForm mode="create" />
    </div>
  );
}
