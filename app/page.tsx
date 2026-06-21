import Link from "next/link";
import { redirect } from "next/navigation";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; next?: string; error?: string }>;
}) {
  const params = await searchParams;

  // OAuth and email links are supposed to land on /auth/callback, but Supabase
  // falls back to the Site URL (this root page) and appends the auth code when
  // the callback URL isn't in the project's redirect allowlist. The canonical
  // fix is to allowlist it in the Supabase dashboard — but we forward the code
  // here too so login still completes regardless. The PKCE verifier lives in a
  // cookie on this domain, so exchangeCodeForSession works from the callback
  // route no matter which path received the code.
  if (params.code) {
    const qs = new URLSearchParams({ code: params.code });
    if (params.next) qs.set("next", params.next);
    redirect(`/auth/callback?${qs.toString()}`);
  }
  // OAuth errors land here the same way (?error=...&error_description=...);
  // route them to the login page's existing error surface.
  if (params.error) {
    redirect("/login?error=auth");
  }

  return (
    <div className="min-h-screen bg-camp-night flex items-center justify-center px-4">
      <div className="text-center max-w-lg">
        <div className="text-6xl mb-6">🏕️</div>
        <h1 className="text-4xl font-bold text-white mb-3">Camp Planner</h1>
        <p className="text-camp-earth text-lg mb-8">
          Plan trips, pack smart, eat well. All in one place.
        </p>
        <Link
          href="/login"
          className="inline-block bg-camp-forest hover:bg-camp-pine text-white font-medium py-3 px-8 rounded-lg transition-colors text-lg"
        >
          Get Started
        </Link>
      </div>
    </div>
  );
}
