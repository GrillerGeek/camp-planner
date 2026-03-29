import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getInventory } from "@/lib/queries/inventory";
import { InventoryClient } from "./components/InventoryClient";

export default async function InventoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const inventory = await getInventory(supabase);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">
            Camper Inventory
          </h1>
          <p className="text-camp-earth text-sm">
            Track what you have on hand across all trips
          </p>
        </div>
      </div>

      <InventoryClient initialInventory={inventory} />
    </div>
  );
}
