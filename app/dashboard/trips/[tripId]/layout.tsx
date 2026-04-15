import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { TripRealtimeShell } from "./components/TripRealtimeShell";

export default async function TripDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null = null;

  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  return (
    <TripRealtimeShell tripId={tripId} profile={profile}>
      {children}
    </TripRealtimeShell>
  );
}
