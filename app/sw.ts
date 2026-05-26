import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig, RuntimeCaching } from "serwist";
import {
  CacheableResponsePlugin,
  ExpirationPlugin,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

// sw.ts runs inside the service worker context — `self` is ServiceWorkerGlobalScope,
// but TypeScript's dom lib types it as Window. Cast through unknown.
const swSelf = self as unknown as WorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

// Canonical UUID format (8-4-4-4-12). Loose matchers like [0-9a-f-]+ would
// catch future non-UUID trip-shaped routes (e.g. /dashboard/trips/new).
const TRIP_ROUTE_REGEX =
  /^\/dashboard\/trips\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/(reservations|packing|meals))?\/?$/;

// Reject responses that arrived via a redirect. The auth proxy issues 302→/login
// for expired sessions; the browser follows the redirect transparently and we'd
// otherwise cache the /login page under the trip URL — serving auth pages as
// trip pages when offline.
const rejectRedirectedPlugin = {
  cacheWillUpdate: async ({ response }: { response: Response }) => {
    if (response.redirected) return null;
    return response;
  },
};

const tripPagesStrategy = new StaleWhileRevalidate({
  cacheName: "trip-pages",
  plugins: [
    new CacheableResponsePlugin({ statuses: [200] }),
    rejectRedirectedPlugin,
    new ExpirationPlugin({
      maxEntries: 100,
      maxAgeSeconds: 30 * 24 * 60 * 60,
    }),
  ],
});

const tripPagesRoute: RuntimeCaching = {
  matcher: ({ url, request, sameOrigin }) => {
    if (!sameOrigin) return false;
    if (request.method !== "GET") return false;
    // RSC payloads use the same URL but a different content type. Let
    // defaultCache's pages-rsc bucket handle them; we cache only HTML
    // navigations here so the same key can't be clobbered by both shapes.
    if (request.headers.get("RSC") === "1") return false;
    return TRIP_ROUTE_REGEX.test(url.pathname);
  },
  handler: tripPagesStrategy,
};

const serwist = new Serwist({
  precacheEntries: swSelf.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [tripPagesRoute, ...defaultCache],
});

serwist.addEventListeners();
