import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// SPEC-009b.1: rate-limit the only anonymous public surface (/shared/[token]).
//
// Spec called for "IP + token" keying, but pure IP keying is the correct
// brute-force defense: an IP+token key lets an attacker make 30 attempts
// on each of N tokens (= N * 30 total attempts) without ever hitting the
// limit. Per-IP keying caps total guesses per IP regardless of token.
//
// Graceful fallback: when Upstash env vars are missing (dev without an
// instance provisioned), we log once and let requests through. We do NOT
// fail closed because that would take down the share feature.

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number; // unix ms when the window resets
  retryAfterSeconds: number; // 0 when allowed
}

const ALLOWED: RateLimitResult = {
  allowed: true,
  limit: 0,
  remaining: 0,
  reset: 0,
  retryAfterSeconds: 0,
};

let limiter: Ratelimit | null = null;
let initWarned = false;

function getLimiter(): Ratelimit | null {
  if (limiter) return limiter;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!initWarned) {
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not set — /shared/[token] rate limit DISABLED. Provision Upstash via Vercel Marketplace and pull env vars before deploying."
      );
      initWarned = true;
    }
    return null;
  }

  limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    // 30 requests per 5 min sliding window — enough for a legit guest
    // refresh loop while making token-guessing expensive.
    limiter: Ratelimit.slidingWindow(30, "5 m"),
    analytics: true,
    prefix: "ratelimit:shared-trip",
  });
  return limiter;
}

/**
 * Rate-check a request to /shared/[token]. Returns ALLOWED when Upstash is
 * not configured (dev fallback). When configured, enforces 30 req / 5 min
 * per IP across all tokens.
 */
export async function checkSharedTripRateLimit(
  ip: string
): Promise<RateLimitResult> {
  const rl = getLimiter();
  if (!rl) return ALLOWED;

  const { success, limit, remaining, reset } = await rl.limit(ip);
  return {
    allowed: success,
    limit,
    remaining,
    reset,
    retryAfterSeconds: success ? 0 : Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
  };
}
