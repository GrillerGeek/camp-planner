import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { checkSharedTripRateLimit } from "@/lib/rate-limit/shared-trip";

export async function proxy(request: NextRequest) {
  // Rate-limit the only anonymous surface (SPEC-009b.1). Done here in the
  // proxy so the limit check runs before the page handler hits Supabase.
  // Other routes skip this and go straight to session refresh.
  if (request.nextUrl.pathname.startsWith("/shared/")) {
    const ip = extractClientIp(request);
    const result = await checkSharedTripRateLimit(ip);
    if (!result.allowed) {
      return new NextResponse("Too many requests. Please try again later.", {
        status: 429,
        headers: {
          "Retry-After": String(result.retryAfterSeconds),
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(result.reset),
        },
      });
    }
  }

  return await updateSession(request);
}

/**
 * Best-effort client IP extraction. Vercel forwards the real client IP via
 * x-forwarded-for (comma-separated chain, leftmost is the original client).
 * Falls back to x-real-ip, then a literal "unknown" so the rate limiter
 * still has a key (unknown clients share one bucket — that's the desired
 * behavior, since we can't tell them apart anyway).
 */
function extractClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/|serwist/|sw\\.js|sw\\.js\\.map|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
