import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig, RuntimeCaching } from "serwist";
import { ExpirationPlugin, Serwist, StaleWhileRevalidate } from "serwist";

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

const TRIP_ROUTE_REGEX =
  /^\/dashboard\/trips\/[0-9a-f-]+(\/(reservations|packing|meals))?\/?$/;

const tripPagesStrategy = new StaleWhileRevalidate({
  cacheName: "trip-pages",
  plugins: [
    new ExpirationPlugin({
      maxEntries: 100,
      maxAgeSeconds: 30 * 24 * 60 * 60,
      purgeOnQuotaError: true,
    }),
  ],
});

const tripPagesRoute: RuntimeCaching = {
  matcher: ({ url, request, sameOrigin }) => {
    if (!sameOrigin) return false;
    if (request.method !== "GET") return false;
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
