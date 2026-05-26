"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();

    // Clear cached trip data so a re-sign-in (possibly as a different user)
    // doesn't see another account's pages. trip-pages holds our SWR'd HTML;
    // pages-rsc / pages-rsc-prefetch / pages are Serwist defaultCache buckets
    // that hold RSC payloads — if we don't clear them, a subsequent user
    // navigating client-side to the same trip URL can be served the prior
    // user's RSC data from these caches. Failures swallowed individually so
    // cache APIs (which can fail in private browsing modes) cannot block
    // sign-out.
    if (typeof caches !== "undefined") {
      await Promise.allSettled([
        caches.delete("trip-pages"),
        caches.delete("pages-rsc"),
        caches.delete("pages-rsc-prefetch"),
        caches.delete("pages"),
      ]);
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
