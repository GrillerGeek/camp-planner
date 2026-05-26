import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SignOutButton } from "./sign-out-button";
import { OfflineProvider } from "@/app/pwa/OfflineContext";
import { OfflineBanner } from "@/app/pwa/OfflineBanner";
import { InstallButton } from "@/app/pwa/InstallButton";
import { DashboardNav } from "./components/DashboardNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <OfflineProvider>
    <OfflineBanner />
    <div className="min-h-screen bg-camp-night">
      <header className="border-b border-white/10 bg-camp-night/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-6">
            <DashboardNav />
            <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <span className="text-xl">🏕️</span>
              <span className="text-white font-semibold text-lg">
                Camp Planner
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-camp-earth text-sm hidden sm:inline">
              {user.email}
            </span>
            {user.user_metadata?.avatar_url && (
              <img
                src={user.user_metadata.avatar_url}
                alt=""
                className="w-8 h-8 rounded-full"
              />
            )}
            <InstallButton />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
    </OfflineProvider>
  );
}
