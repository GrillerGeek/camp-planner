import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SignOutButton } from "./sign-out-button";

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
    <div className="min-h-screen bg-camp-night">
      <header className="border-b border-white/10 bg-camp-night/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <span className="text-xl">🏕️</span>
              <span className="text-white font-semibold text-lg">
                Camp Planner
              </span>
            </Link>
            <nav className="hidden sm:flex items-center gap-4">
              <Link href="/dashboard" className="text-camp-earth hover:text-white text-sm transition-colors">
                Trips
              </Link>
              <Link href="/dashboard/templates" className="text-camp-earth hover:text-white text-sm transition-colors">
                Templates
              </Link>
              <Link href="/dashboard/recipes" className="text-camp-earth hover:text-white text-sm transition-colors">
                Recipes
              </Link>
              <Link href="/dashboard/inventory" className="text-camp-earth hover:text-white text-sm transition-colors">
                Inventory
              </Link>
            </nav>
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
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
