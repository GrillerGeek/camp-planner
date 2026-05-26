"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();

    // Clear cached trip data so a re-sign-in (possibly as a different user)
    // doesn't see another account's pages. Failures swallowed so cache APIs
    // (which can fail in private browsing modes) cannot block sign-out.
    if (typeof caches !== "undefined") {
      try {
        await caches.delete("trip-pages");
      } catch {
        // Ignore — cache API can fail in private browsing.
      }
    }

    router.push("/login");
  };

  return (
    <button
      onClick={handleSignOut}
      className="text-camp-earth hover:text-white text-sm transition-colors"
    >
      Sign out
    </button>
  );
}
