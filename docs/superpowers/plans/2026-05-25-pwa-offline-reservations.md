# PWA Offline Reservations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship SPEC-008b.1 — make camp-planner installable as a PWA and serve cached trip detail / reservations / packing / meals pages when the user is offline. Read-only; no offline edits.

**Architecture:** Serwist on Turbopack. A `withSerwist`-wrapped Next config + a Route Handler at `app/serwist/sw.js/route.ts` builds and serves the SW. The SW source (`app/sw.ts`) uses `defaultCache` for static assets and a `StaleWhileRevalidate` strategy with a path-regex matcher for the four trip routes (cache name `trip-pages`). Client-side: an `<OfflineProvider>` exposes `useIsOffline()` to gate every edit button; an `<OfflineBanner>` and `<InstallButton>` live in the dashboard header; `<CachePrefetcher>` on the trip detail page eager-prefetches the three sub-tabs; four `error.tsx` boundaries render a shared `<OfflineEmptyState>` when a route can't be served. On sign-out, `caches.delete("trip-pages")` clears all cached trip data.

**Tech Stack:** Next.js 16.2.6 (App Router, Turbopack), React 19, TypeScript strict, Serwist 10+ (`@serwist/turbopack` + `serwist` + `esbuild`), Tailwind v4. **No test runner is configured** — verification steps below run dev server + manual checks + typecheck + lint.

**Reference spec:** `docs/superpowers/specs/2026-05-25-pwa-offline-reservations-design.md`. Section §X references below point there.

**Simplifications adopted vs the design doc:**
- `CacheFreshness` renders a static "Showing cached data — connect to refresh" label when `navigator.onLine === false` (no SW→client postMessage; no per-page time-since-cache). The offline banner already conveys "last synced." Precision can be added later.

---

## File Structure

**New files:**
- `app/sw.ts` — Serwist service worker source (TypeScript, compiled via esbuild by `@serwist/turbopack`).
- `app/serwist/sw.js/route.ts` — Route handler that compiles and serves the SW.
- `app/pwa/OfflineContext.tsx` — React context + `<OfflineProvider>` + `useIsOffline()` hook. One file.
- `app/pwa/OfflineBanner.tsx` — Sticky banner at top of dashboard when offline.
- `app/pwa/InstallButton.tsx` — Install affordance + iOS fallback hint.
- `app/pwa/CachePrefetcher.tsx` — Trip-detail-mounted client island that fires three background fetches.
- `app/pwa/CacheFreshness.tsx` — Per-page "showing cached data" label, only when offline.
- `app/pwa/OfflineEmptyState.tsx` — Reusable empty state for `error.tsx` boundaries.
- `app/dashboard/trips/[tripId]/error.tsx` — Trip detail offline-aware error boundary.
- `app/dashboard/trips/[tripId]/reservations/error.tsx` — Reservations offline-aware error boundary.
- `app/dashboard/trips/[tripId]/packing/error.tsx` — Packing offline-aware error boundary.
- `app/dashboard/trips/[tripId]/meals/error.tsx` — Meals offline-aware error boundary.
- `docs/specs/SPEC-008b.1-test-log.md` — Manual test log filled in at ship time.

**Modified files:**
- `next.config.ts` — wrap export in `withSerwist`.
- `package.json` — add `@serwist/turbopack`, `serwist`, `esbuild` as devDependencies.
- `public/manifest.json` — expand with `scope`, `description`, `categories`.
- `app/layout.tsx` — wrap children in `<SerwistProvider swUrl="/serwist/sw.js">`.
- `app/dashboard/layout.tsx` — wrap children in `<OfflineProvider>`, mount `<OfflineBanner>` and `<InstallButton>`.
- `app/dashboard/sign-out-button.tsx` — clear `trip-pages` cache before navigating to `/login`.
- `app/dashboard/trips/[tripId]/page.tsx` — mount `<CachePrefetcher tripId={tripId} />` and `<CacheFreshness />`.
- `app/dashboard/trips/[tripId]/reservations/page.tsx` — mount `<CacheFreshness />`.
- `app/dashboard/trips/[tripId]/packing/page.tsx` — mount `<CacheFreshness />`.
- `app/dashboard/trips/[tripId]/meals/page.tsx` — mount `<CacheFreshness />`.
- `app/dashboard/trips/[tripId]/reservations/components/ReservationsClient.tsx` — gate add/edit/delete buttons via `useIsOffline()`, extend submit error path for offline.
- All other client components with mutation entry points across packing, grocery, tasks, meals routes — same gating treatment (Task 11 enumerates them).
- `docs/specs/SPEC-008b.yaml` — update SPEC-008b.1 sub-item to `shipped` with `implementation:` block; update parent `status: shipped`.
- `docs/expectations/EXP-025.*` (location TBD by grep in Task 13) — amend write-queue clause.

---

## Task 1: Install Serwist deps and verify Next 16 compatibility (spike)

Goal: confirm Serwist 10+ builds cleanly on Next 16.2.6 with Turbopack before writing any code that depends on it. Smallest possible setup: install deps, wire up an empty SW, run dev server, see SW register in DevTools.

**Files:**
- Create: `app/sw.ts`, `app/serwist/sw.js/route.ts`
- Modify: `next.config.ts`, `app/layout.tsx`, `package.json`

- [ ] **Step 1: Install dependencies**

```bash
npm i -D @serwist/turbopack serwist esbuild
```

Expected: deps appear under `devDependencies` in `package.json`. `package-lock.json` updates. No peer-dependency warnings about Next 16 (a warning here is the spike's failure signal — STOP and report).

- [ ] **Step 2: Wrap `next.config.ts` with `withSerwist`**

Replace the entire file contents of `next.config.ts` with:

```ts
import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSerwist(nextConfig);
```

- [ ] **Step 3: Create the minimal SW source at `app/sw.ts`**

```ts
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
```

This is intentionally barebones — no custom routes yet. Task 4 adds them.

- [ ] **Step 4: Create the route handler at `app/serwist/sw.js/route.ts`**

```ts
import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    swSrc: "app/sw.ts",
    additionalPrecacheEntries: [],
    useNativeEsbuild: true,
  });

export { revision }; // exported for type-narrowness check; not used at runtime
```

Note: `revision` is exported just to keep the `spawnSync` call referenced — Turbopack will tree-shake it from the route output but the call still runs at build to produce a stable revision identifier in environments that want it. If TS complains about the unused export, delete the export line and the `revision` constant — they're not load-bearing for v1.

- [ ] **Step 5: Wire the SerwistProvider into the root layout**

Modify `app/layout.tsx`. Replace lines 25-38 (the `RootLayout` component body) with:

```tsx
import { SerwistProvider } from "@serwist/turbopack/react";

// ... metadata and viewport stay identical ...

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SerwistProvider swUrl="/serwist/sw.js">{children}</SerwistProvider>
      </body>
    </html>
  );
}
```

Keep the existing `import "./globals.css"`, font imports, `metadata`, and `viewport` exports — only the JSX `<body>` and the new `SerwistProvider` import change.

- [ ] **Step 6: Verify typecheck + lint clean**

Run:

```bash
npm run typecheck && npm run lint
```

Expected: both exit 0. If typecheck fails on `@serwist/turbopack/react` not having types, install the latest version (`npm i -D @serwist/turbopack@latest`) and re-run.

- [ ] **Step 7: Verify SW registers in the dev server**

Run `npm run dev`. Open `http://localhost:3000` in Chrome. Open DevTools → Application → Service Workers. Expected: a service worker at scope `http://localhost:3000/` with status "activated and is running" and source `/serwist/sw.js`. If it shows "redundant" or fails to register, check the console for errors and STOP.

- [ ] **Step 8: Commit**

```bash
git add app/sw.ts app/serwist/ next.config.ts app/layout.tsx package.json package-lock.json
git commit -m "$(cat <<'EOF'
SPEC-008b.1 (1/12): wire Serwist on Next 16 / Turbopack

Adds @serwist/turbopack + serwist + esbuild dev deps. Minimal SW
source at app/sw.ts with defaultCache only — runtime caching of
trip routes lands in a later task. SerwistProvider in root layout
registers the SW client-side.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Expand the PWA manifest

Goal: turn `public/manifest.json` into a proper install target so the install button (Task 8) actually fires `beforeinstallprompt` reliably.

**Files:**
- Modify: `public/manifest.json`

- [ ] **Step 1: Replace `public/manifest.json` contents**

Current file is a 21-line minimal manifest. Replace its entire contents with:

```json
{
  "name": "Camp Planner",
  "short_name": "CampPlan",
  "description": "Plan trips, pack smart, eat well. View your reservations, packing list, and meals offline at the campsite.",
  "start_url": "/dashboard",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#1a1a2e",
  "theme_color": "#16a34a",
  "categories": ["productivity", "lifestyle", "travel"],
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Step 2: Verify manifest validity in dev**

Run `npm run dev`. Open `http://localhost:3000/dashboard` in Chrome. DevTools → Application → Manifest. Expected: no errors. "Installability" section shows green checks for all criteria except possibly "screenshots" (optional). If "Icons" reports a maskable purpose error, verify `public/icons/icon-192.png` and `public/icons/icon-512.png` exist — they should (from `app/manifest.json` line 8-19 in the pre-change file).

- [ ] **Step 3: Commit**

```bash
git add public/manifest.json
git commit -m "$(cat <<'EOF'
SPEC-008b.1 (2/12): expand PWA manifest for install criteria

Adds scope, description, categories, orientation, and maskable
purpose so beforeinstallprompt fires reliably on Chrome / Android.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: OfflineContext + useIsOffline hook

Goal: ship the offline-state plumbing first so later tasks (banner, install button, edit-button gating) can all consume it. No UI yet.

**Files:**
- Create: `app/pwa/OfflineContext.tsx`

- [ ] **Step 1: Create `app/pwa/OfflineContext.tsx`**

```tsx
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface OfflineContextValue {
  isOffline: boolean;
}

const OfflineContext = createContext<OfflineContextValue>({ isOffline: false });

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const update = () => setIsOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <OfflineContext.Provider value={{ isOffline }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useIsOffline(): boolean {
  return useContext(OfflineContext).isOffline;
}
```

Notes for the implementer:
- `isOffline` initial state is `false` (not `!navigator.onLine`) because Server Component initial render must match client. The `useEffect` flips it on mount if actually offline.
- This is the only component that reads `navigator.onLine` and the `online`/`offline` events. Every other consumer reads `useIsOffline()`.

- [ ] **Step 2: Mount the provider in the dashboard layout**

Modify `app/dashboard/layout.tsx`. Add this import at the top alongside the existing imports:

```tsx
import { OfflineProvider } from "@/app/pwa/OfflineContext";
```

Then wrap the existing return value (the `<div className="min-h-screen bg-camp-night">…</div>` block, starting at line 20) so the entire dashboard subtree is inside `<OfflineProvider>`:

```tsx
return (
  <OfflineProvider>
    <div className="min-h-screen bg-camp-night">
      {/* existing header + main unchanged */}
    </div>
  </OfflineProvider>
);
```

- [ ] **Step 3: Verify typecheck + lint clean**

```bash
npm run typecheck && npm run lint
```

Expected: both exit 0.

- [ ] **Step 4: Smoke test the hook**

Open `app/dashboard/page.tsx` (or any dashboard client component) temporarily and add at the top:

```tsx
// TEMP: smoke test useIsOffline
import { useIsOffline } from "@/app/pwa/OfflineContext";
```

Then inside a Client Component you control, log `useIsOffline()` to the console. Run `npm run dev`, open `http://localhost:3000/dashboard`, confirm `false` logs. Open Chrome DevTools → Network → check "Offline" → confirm `true` logs after a small delay (React state update). Uncheck and confirm it flips back.

**Important:** revert the smoke-test changes before committing — they exist only to verify the hook works.

- [ ] **Step 5: Commit**

```bash
git add app/pwa/OfflineContext.tsx app/dashboard/layout.tsx
git commit -m "$(cat <<'EOF'
SPEC-008b.1 (3/12): OfflineProvider + useIsOffline hook

Single source of truth for offline state across the dashboard subtree.
Mounted in app/dashboard/layout.tsx; consumed by banner, install
button, and edit-button gating in later tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Trip-route runtime caching in the SW

Goal: replace the empty SW from Task 1 with one that actually caches the four trip routes via stale-while-revalidate.

**Files:**
- Modify: `app/sw.ts`

- [ ] **Step 1: Replace `app/sw.ts` with full caching strategy**

Replace the entire file contents with:

```ts
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig, RuntimeCaching } from "serwist";
import { ExpirationPlugin, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const TRIP_ROUTE_REGEX =
  /^\/dashboard\/trips\/[0-9a-f-]+(\/(reservations|packing|meals))?\/?$/;

const tripPagesStrategy = new StaleWhileRevalidate({
  cacheName: "trip-pages",
  plugins: [
    new ExpirationPlugin({
      maxEntries: 100,
      maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      purgeOnQuotaError: true,
    }),
  ],
});

const tripPagesRoute: RuntimeCaching = {
  matcher: ({ url, request, sameOrigin }) => {
    if (!sameOrigin) return false;
    // Match both navigation and RSC requests. Next 16 RSC requests
    // hit the same pathname; we accept either GET destination here
    // and let the strategy cache them under a path+search-derived key.
    if (request.method !== "GET") return false;
    return TRIP_ROUTE_REGEX.test(url.pathname);
  },
  handler: tripPagesStrategy,
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [tripPagesRoute, ...defaultCache],
});

serwist.addEventListeners();
```

Notes:
- `TRIP_ROUTE_REGEX` matches the four routes: trip detail and three sub-tabs. Trailing-slash optional. UUID is treated as `[0-9a-f-]+` because trip IDs are UUIDs.
- The matcher checks `sameOrigin` and `request.method === "GET"` defensively. Next's RSC requests are also GET; both navigation HTML and RSC payloads land in the cache.
- `purgeOnQuotaError: true` tells the ExpirationPlugin to evict on quota errors instead of throwing.
- `tripPagesRoute` is listed *before* `defaultCache` in the array — Serwist evaluates matchers in order; we want our specific regex to win.

- [ ] **Step 2: Verify typecheck clean**

```bash
npm run typecheck
```

Expected: exit 0. If `RuntimeCaching` import fails, check the Serwist version — newer versions export it from `serwist` root.

- [ ] **Step 3: Test the cache populates in dev**

Run `npm run dev`. Open `http://localhost:3000/dashboard` in Chrome. Sign in if not already. Open any trip detail page (`/dashboard/trips/<some-uuid>`). Open DevTools → Application → Cache Storage. Expected: a cache named `trip-pages` containing at least one entry — the trip detail page URL. Navigate to `/reservations`, `/packing`, `/meals` for the same trip. Each navigation should add an entry to `trip-pages`.

- [ ] **Step 4: Test SWR behavior**

Still on the trip's `/reservations` page, reload the page. Open DevTools → Network → look at the page document request. The "Status" column should show `(ServiceWorker)` and "Time" should be fast (cached). Then in Application → Service Workers, click "Update" or just keep navigating — the SW should also be making background fetches to revalidate.

- [ ] **Step 5: Commit**

```bash
git add app/sw.ts
git commit -m "$(cat <<'EOF'
SPEC-008b.1 (4/12): cache trip routes with stale-while-revalidate

Trip detail + reservations + packing + meals pages are intercepted
by a path-regex matcher and served from a 'trip-pages' cache (max
100 entries, 30 days). RSC payloads and navigation HTML both land
in the cache.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: CachePrefetcher — eager-fetch sub-tabs on trip detail visit

Goal: when a user opens a trip's detail page, populate the cache for `/reservations`, `/packing`, `/meals` in the background so all four are available offline after one visit.

**Files:**
- Create: `app/pwa/CachePrefetcher.tsx`
- Modify: `app/dashboard/trips/[tripId]/page.tsx`

- [ ] **Step 1: Create `app/pwa/CachePrefetcher.tsx`**

```tsx
"use client";

import { useEffect } from "react";

interface CachePrefetcherProps {
  tripId: string;
}

export function CachePrefetcher({ tripId }: CachePrefetcherProps) {
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) {
      return;
    }
    if (!navigator.onLine) return;

    const paths = [
      `/dashboard/trips/${tripId}/reservations`,
      `/dashboard/trips/${tripId}/packing`,
      `/dashboard/trips/${tripId}/meals`,
    ];

    const timer = window.setTimeout(() => {
      void Promise.allSettled(
        paths.map((p) =>
          fetch(p, {
            credentials: "same-origin",
            // Default cache mode; let the SW decide what to cache.
          }).catch(() => undefined)
        )
      );
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [tripId]);

  return null;
}
```

Notes:
- 1-second delay avoids competing with the trip detail page's own initial paint.
- Guards: bails if no SW controller (first load before SW takes over), bails if currently offline.
- `Promise.allSettled` + per-fetch `.catch` means a single failure can't reject the lot.
- Returns `null` — pure side-effect component.

- [ ] **Step 2: Mount in `app/dashboard/trips/[tripId]/page.tsx`**

The current trip detail page is a Server Component. We need to mount a Client Component inside it. Add this import:

```tsx
import { CachePrefetcher } from "@/app/pwa/CachePrefetcher";
```

Then immediately inside the outermost `<div>` of the trip-found branch (line 63, right after `<div>`), add:

```tsx
<CachePrefetcher tripId={tripId} />
```

The final structure of the JSX from line 62-64 should read:

```tsx
return (
  <div>
    <CachePrefetcher tripId={tripId} />
    <TripHeader trip={trip} userRole={role} />
    {/* rest unchanged */}
  </div>
);
```

- [ ] **Step 3: Verify typecheck + lint clean**

```bash
npm run typecheck && npm run lint
```

Expected: both exit 0.

- [ ] **Step 4: Verify prefetch fires**

Run `npm run dev`. Open a trip detail page in Chrome. Open DevTools → Network. Wait 1-2 seconds. Expected: three GET requests appear to `/dashboard/trips/<id>/reservations`, `/packing`, `/meals`. Each should show "(ServiceWorker)" in the Status column on subsequent visits. After this single visit, DevTools → Application → Cache Storage → `trip-pages` should show four entries.

- [ ] **Step 5: Commit**

```bash
git add app/pwa/CachePrefetcher.tsx app/dashboard/trips/\[tripId\]/page.tsx
git commit -m "$(cat <<'EOF'
SPEC-008b.1 (5/12): eager-prefetch sub-tabs on trip detail visit

One visit to a trip detail page now caches reservations, packing,
and meals for that trip. Bails if SW not controlling or already
offline; 1s delay to avoid competing with initial paint.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: OfflineBanner — visible "you are offline" UI

Goal: when offline, render a sticky banner at the top of the dashboard.

**Files:**
- Create: `app/pwa/OfflineBanner.tsx`
- Modify: `app/dashboard/layout.tsx`

- [ ] **Step 1: Create `app/pwa/OfflineBanner.tsx`**

```tsx
"use client";

import { useIsOffline } from "./OfflineContext";

export function OfflineBanner() {
  const isOffline = useIsOffline();
  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[60] bg-camp-earth text-camp-night text-sm font-medium px-4 py-2 text-center"
    >
      You&apos;re offline — showing last synced data. Editing is paused.
    </div>
  );
}
```

Notes:
- `z-[60]` sits above the existing header (which uses `z-50`).
- Tailwind tokens `bg-camp-earth` + `text-camp-night` are defined in `app/globals.css`.
- `role="status"` + `aria-live="polite"` so screen readers announce the change.

- [ ] **Step 2: Mount in `app/dashboard/layout.tsx`**

Add an import:

```tsx
import { OfflineBanner } from "@/app/pwa/OfflineBanner";
```

Then add the banner inside `<OfflineProvider>` but *above* the existing `<div className="min-h-screen bg-camp-night">…`. The wrapper from Task 3 should now read:

```tsx
return (
  <OfflineProvider>
    <OfflineBanner />
    <div className="min-h-screen bg-camp-night">
      {/* existing header + main unchanged */}
    </div>
  </OfflineProvider>
);
```

- [ ] **Step 3: Verify typecheck + lint clean**

```bash
npm run typecheck && npm run lint
```

Expected: both exit 0.

- [ ] **Step 4: Manual test the banner**

Run `npm run dev`. Open `http://localhost:3000/dashboard`. Open DevTools → Network → check "Offline". Expected: the banner appears at the top within ~100ms. Uncheck "Offline" — banner disappears. Confirm the banner doesn't push the rest of the layout (it should be sticky).

- [ ] **Step 5: Commit**

```bash
git add app/pwa/OfflineBanner.tsx app/dashboard/layout.tsx
git commit -m "$(cat <<'EOF'
SPEC-008b.1 (6/12): OfflineBanner shown when navigator.onLine flips

Sticky banner at top of the dashboard subtree when offline.
Aria-live so screen readers announce the state change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: InstallButton — explicit install affordance

Goal: small "Install app" button in the dashboard header when the browser reports the app is installable; dismissible with a localStorage flag; iOS Safari shows a one-time hint instead.

**Files:**
- Create: `app/pwa/InstallButton.tsx`
- Modify: `app/dashboard/layout.tsx`

- [ ] **Step 1: Create `app/pwa/InstallButton.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "camp-planner-install-dismissed";

// Type for the beforeinstallprompt event (not in lib.dom.d.ts).
type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const webkit = /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallButton() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(DISMISS_KEY) === "true") {
      setDismissed(true);
      return;
    }
    if (isStandalone()) {
      // Already installed
      return;
    }

    if (isIosSafari()) {
      setShowIosHint(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
    setShowIosHint(false);
    setInstallEvent(null);
  };

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      setInstallEvent(null);
    } else {
      handleDismiss();
    }
  };

  if (dismissed) return null;

  if (showIosHint) {
    return (
      <div className="hidden sm:flex items-center gap-2 text-xs text-camp-earth">
        <span>Install: Share → Add to Home Screen</span>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss install hint"
          className="text-camp-earth/60 hover:text-white"
        >
          ✕
        </button>
      </div>
    );
  }

  if (!installEvent) return null;

  return (
    <button
      onClick={handleInstall}
      className="text-xs bg-camp-forest hover:bg-camp-pine text-white font-medium py-1.5 px-3 rounded-lg transition-colors"
    >
      Install app
    </button>
  );
}
```

Notes:
- `BeforeInstallPromptEvent` is declared inline since lib.dom.d.ts doesn't include it.
- `isIosSafari` excludes Chrome / Firefox / Edge iOS browsers (they all share the WebKit engine but don't behave like Safari for installability).
- `isStandalone` handles both Android-style display-mode check and iOS's legacy `navigator.standalone` boolean.
- Dismissed state lives in localStorage; clearing it requires the user to clear site data.

- [ ] **Step 2: Mount in `app/dashboard/layout.tsx`**

Add the import:

```tsx
import { InstallButton } from "@/app/pwa/InstallButton";
```

Insert `<InstallButton />` into the right-side header group, immediately *before* the `<SignOutButton />`. The existing div at line 52-64 becomes:

```tsx
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
```

- [ ] **Step 3: Verify typecheck + lint clean**

```bash
npm run typecheck && npm run lint
```

Expected: both exit 0.

- [ ] **Step 4: Test on desktop Chrome**

Run `npm run dev`. Open `http://localhost:3000/dashboard` in Chrome (incognito to ensure fresh localStorage). Wait. If the manifest + SW are valid, an "Install app" button should appear in the header within a few seconds. Click it → Chrome shows the install prompt. Cancel — button should disappear (we treat dismiss as a longer-lived choice).

If the button never appears: open DevTools → Application → Manifest and resolve any reported issues. Common cause: missing `start_url` (Task 2 fixed this) or SW not activated (Task 1).

- [ ] **Step 5: Test iOS Safari hint logic**

In Chrome DevTools, toggle device emulation to "iPhone SE" and set user agent override to a real iOS Safari UA string. Reload `/dashboard`. Expected: the small "Install: Share → Add to Home Screen" hint appears in the header instead. Click the ✕ — it disappears.

- [ ] **Step 6: Commit**

```bash
git add app/pwa/InstallButton.tsx app/dashboard/layout.tsx
git commit -m "$(cat <<'EOF'
SPEC-008b.1 (7/12): InstallButton with iOS Safari fallback hint

Shows when browser fires beforeinstallprompt; iOS Safari gets a
small 'Share → Add to Home Screen' hint instead. Dismissal
persists in localStorage to avoid nagging.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: CacheFreshness — per-page "showing cached data" label

Goal: small label near the page title indicating the user is looking at cached data when offline. Per the plan's simplification: no time delta; static label only.

**Files:**
- Create: `app/pwa/CacheFreshness.tsx`
- Modify: `app/dashboard/trips/[tripId]/page.tsx`, `app/dashboard/trips/[tripId]/reservations/page.tsx`, `app/dashboard/trips/[tripId]/packing/page.tsx`, `app/dashboard/trips/[tripId]/meals/page.tsx`

- [ ] **Step 1: Create `app/pwa/CacheFreshness.tsx`**

```tsx
"use client";

import { useIsOffline } from "./OfflineContext";

export function CacheFreshness() {
  const isOffline = useIsOffline();
  if (!isOffline) return null;

  return (
    <div className="text-xs text-camp-earth/70 italic mb-2">
      Showing cached data — connect to refresh.
    </div>
  );
}
```

That's it. Two lines of meaningful logic.

- [ ] **Step 2: Mount it on the trip detail page**

In `app/dashboard/trips/[tripId]/page.tsx`, add the import alongside `CachePrefetcher`:

```tsx
import { CacheFreshness } from "@/app/pwa/CacheFreshness";
```

Then add `<CacheFreshness />` immediately after `<TripHeader>` so the label appears just below the page title. The JSX from Task 5 becomes:

```tsx
return (
  <div>
    <CachePrefetcher tripId={tripId} />
    <TripHeader trip={trip} userRole={role} />
    <CacheFreshness />
    {/* rest unchanged */}
  </div>
);
```

- [ ] **Step 3: Mount it on the three sub-tab pages**

For each of `reservations/page.tsx`, `packing/page.tsx`, `meals/page.tsx`: open the file, find the outermost JSX element returned by the page component, and add `<CacheFreshness />` as the first child. Add the import at the top of each file:

```tsx
import { CacheFreshness } from "@/app/pwa/CacheFreshness";
```

The placement: directly above the existing page heading / first content block. Exact line numbers vary per file — find the return statement and put `<CacheFreshness />` as the first child JSX element.

- [ ] **Step 4: Verify typecheck + lint clean**

```bash
npm run typecheck && npm run lint
```

Expected: both exit 0.

- [ ] **Step 5: Manual test**

Run `npm run dev`. Visit a trip detail page, then its `/reservations`, `/packing`, `/meals`. Online: no label visible. Toggle DevTools → Network → "Offline": label appears on each of the four pages.

- [ ] **Step 6: Commit**

```bash
git add app/pwa/CacheFreshness.tsx app/dashboard/trips/\[tripId\]/page.tsx app/dashboard/trips/\[tripId\]/reservations/page.tsx app/dashboard/trips/\[tripId\]/packing/page.tsx app/dashboard/trips/\[tripId\]/meals/page.tsx
git commit -m "$(cat <<'EOF'
SPEC-008b.1 (8/12): CacheFreshness label when offline

Static 'Showing cached data' label rendered near the title on
trip detail + reservations + packing + meals pages when offline.
Time-delta precision deferred — banner already conveys 'last synced'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: OfflineEmptyState + four error.tsx boundaries

Goal: when a user navigates to a route they've never cached and the network fails, show a clear "this isn't available offline" empty state instead of Next's default error UI.

**Files:**
- Create: `app/pwa/OfflineEmptyState.tsx`
- Create: `app/dashboard/trips/[tripId]/error.tsx`
- Create: `app/dashboard/trips/[tripId]/reservations/error.tsx`
- Create: `app/dashboard/trips/[tripId]/packing/error.tsx`
- Create: `app/dashboard/trips/[tripId]/meals/error.tsx`

- [ ] **Step 1: Create `app/pwa/OfflineEmptyState.tsx`**

```tsx
"use client";

interface OfflineEmptyStateProps {
  pageName: "trip" | "reservations" | "packing" | "meals";
  onRetry?: () => void;
}

const COPY: Record<OfflineEmptyStateProps["pageName"], string> = {
  trip: "This trip isn't available offline. Connect to the internet to load it.",
  reservations:
    "This trip's reservations aren't available offline. Connect to the internet to load them.",
  packing:
    "This trip's packing list isn't available offline. Connect to the internet to load it.",
  meals:
    "This trip's meal plan isn't available offline. Connect to the internet to load it.",
};

export function OfflineEmptyState({ pageName, onRetry }: OfflineEmptyStateProps) {
  return (
    <div className="text-center py-16">
      <div className="text-5xl mb-4">📡</div>
      <h2 className="text-xl font-semibold text-white mb-2">
        Not available offline
      </h2>
      <p className="text-camp-earth mb-6 max-w-md mx-auto">{COPY[pageName]}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-block bg-camp-forest hover:bg-camp-pine text-white font-medium py-2.5 px-5 rounded-lg transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `app/dashboard/trips/[tripId]/error.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { OfflineEmptyState } from "@/app/pwa/OfflineEmptyState";

export default function TripDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console for diagnostics; replace with real reporting if added later.
    console.error("Trip detail error:", error);
  }, [error]);

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return <OfflineEmptyState pageName="trip" onRetry={reset} />;
  }

  return (
    <div className="text-center py-16">
      <div className="text-5xl mb-4">⚠️</div>
      <h2 className="text-xl font-semibold text-white mb-2">
        Something went wrong
      </h2>
      <p className="text-camp-earth mb-6">{error.message}</p>
      <button
        onClick={reset}
        className="inline-block bg-camp-forest hover:bg-camp-pine text-white font-medium py-2.5 px-5 rounded-lg transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create the three sub-tab error boundaries**

`app/dashboard/trips/[tripId]/reservations/error.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { OfflineEmptyState } from "@/app/pwa/OfflineEmptyState";

export default function ReservationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Reservations error:", error);
  }, [error]);

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return <OfflineEmptyState pageName="reservations" onRetry={reset} />;
  }

  return (
    <div className="text-center py-16">
      <div className="text-5xl mb-4">⚠️</div>
      <h2 className="text-xl font-semibold text-white mb-2">
        Something went wrong
      </h2>
      <p className="text-camp-earth mb-6">{error.message}</p>
      <button
        onClick={reset}
        className="inline-block bg-camp-forest hover:bg-camp-pine text-white font-medium py-2.5 px-5 rounded-lg transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
```

`app/dashboard/trips/[tripId]/packing/error.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { OfflineEmptyState } from "@/app/pwa/OfflineEmptyState";

export default function PackingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Packing error:", error);
  }, [error]);

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return <OfflineEmptyState pageName="packing" onRetry={reset} />;
  }

  return (
    <div className="text-center py-16">
      <div className="text-5xl mb-4">⚠️</div>
      <h2 className="text-xl font-semibold text-white mb-2">
        Something went wrong
      </h2>
      <p className="text-camp-earth mb-6">{error.message}</p>
      <button
        onClick={reset}
        className="inline-block bg-camp-forest hover:bg-camp-pine text-white font-medium py-2.5 px-5 rounded-lg transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
```

`app/dashboard/trips/[tripId]/meals/error.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { OfflineEmptyState } from "@/app/pwa/OfflineEmptyState";

export default function MealsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Meals error:", error);
  }, [error]);

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return <OfflineEmptyState pageName="meals" onRetry={reset} />;
  }

  return (
    <div className="text-center py-16">
      <div className="text-5xl mb-4">⚠️</div>
      <h2 className="text-xl font-semibold text-white mb-2">
        Something went wrong
      </h2>
      <p className="text-camp-earth mb-6">{error.message}</p>
      <button
        onClick={reset}
        className="inline-block bg-camp-forest hover:bg-camp-pine text-white font-medium py-2.5 px-5 rounded-lg transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
```

(Yes, the four files are near-identical. Per the no-placeholders rule, each is fully spelled out. They differ only in `console.error` prefix and `pageName` prop.)

- [ ] **Step 4: Verify typecheck + lint clean**

```bash
npm run typecheck && npm run lint
```

Expected: both exit 0.

- [ ] **Step 5: Manual test the empty state**

Run `npm run dev`. Sign in. Navigate to `/dashboard` (cached after Task 4). Find a trip whose detail page you have *never* visited (or open the dashboard in an Incognito window after the SW activates). Enable DevTools Network → Offline. Click into that trip → expected: `<OfflineEmptyState pageName="trip">` renders. Click "Try again" → still offline → empty state remains.

- [ ] **Step 6: Commit**

```bash
git add app/pwa/OfflineEmptyState.tsx app/dashboard/trips/\[tripId\]/error.tsx app/dashboard/trips/\[tripId\]/reservations/error.tsx app/dashboard/trips/\[tripId\]/packing/error.tsx app/dashboard/trips/\[tripId\]/meals/error.tsx
git commit -m "$(cat <<'EOF'
SPEC-008b.1 (9/12): OfflineEmptyState + four error.tsx boundaries

When a trip-scoped route fails to load and navigator.onLine is
false, render a clear 'not available offline' empty state instead
of Next's default error UI. First error.tsx files in the app.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Gate the reservations edit buttons via useIsOffline

Goal: implement the offline-gating pattern on one route end-to-end, so Task 11 can replicate it cleanly across the others.

**Files:**
- Modify: `app/dashboard/trips/[tripId]/reservations/components/ReservationsClient.tsx`

- [ ] **Step 1: Add the import and hook call**

At the top of `ReservationsClient.tsx`, alongside the existing imports, add:

```tsx
import { useIsOffline } from "@/app/pwa/OfflineContext";
```

Inside the `ReservationsClient` function body (around line 53, after `const supabase = createClient();`), add:

```tsx
const isOffline = useIsOffline();
```

- [ ] **Step 2: Update `handleSubmit` to surface offline errors clearly**

The existing `handleSubmit` (line 72) has a `catch` block at line 106-108. Replace the `catch` block contents with:

```tsx
} catch (err) {
  if (!navigator.onLine) {
    setError(
      "You're offline — your changes weren't saved. Try again when you're back online."
    );
  } else {
    setError(err instanceof Error ? err.message : "Failed to save reservation.");
  }
} finally {
```

(Keep the existing `finally` block — only the `catch` body changes.)

- [ ] **Step 3: Update `handleDelete` similarly**

The existing `handleDelete` (line 120) has its own `catch` block at line 125-127. Replace its body with:

```tsx
} catch (err) {
  if (!navigator.onLine) {
    setError(
      "You're offline — your changes weren't saved. Try again when you're back online."
    );
  } else {
    setError(err instanceof Error ? err.message : "Failed to delete reservation.");
  }
}
```

- [ ] **Step 4: Disable the "Add Reservation" button (empty state)**

At line 170-181, the first "Add Reservation" button. Update its JSX to:

```tsx
{isPlanner && (
  <button
    disabled={isOffline}
    title={isOffline ? "Connect to the internet to add reservations" : undefined}
    onClick={() => {
      setShowForm(true);
      setEditingId(null);
      setForm(emptyForm);
    }}
    className="inline-block bg-camp-forest hover:bg-camp-pine text-white font-medium py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
  >
    Add Reservation
  </button>
)}
```

- [ ] **Step 5: Disable the "Edit" button per row**

At line 218-222, the Edit button inside each reservation card. Update to:

```tsx
<button
  disabled={isOffline}
  title={isOffline ? "Connect to the internet to edit" : undefined}
  onClick={() => handleEdit(reservation)}
  className="text-camp-earth hover:text-white text-sm py-1 px-2 rounded hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
>
  Edit
</button>
```

- [ ] **Step 6: Disable the delete-trigger button**

At line 239-244, the Delete button (the one that opens the confirm prompt). Update to:

```tsx
<button
  disabled={isOffline}
  title={isOffline ? "Connect to the internet to delete" : undefined}
  onClick={() => setDeleteConfirmId(reservation.id)}
  className="text-red-400/60 hover:text-red-400 text-sm py-1 px-2 rounded hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
>
  Delete
</button>
```

(The Confirm/Cancel inner buttons only appear when `deleteConfirmId === reservation.id`, which can only happen after the user clicked Delete while online — leave them alone.)

- [ ] **Step 7: Disable the second "Add Reservation" button (after list)**

At line 298-322, the button shown after the list. Update to:

```tsx
{isPlanner && !showForm && reservations.length > 0 && (
  <button
    disabled={isOffline}
    title={isOffline ? "Connect to the internet to add reservations" : undefined}
    onClick={() => {
      setShowForm(true);
      setEditingId(null);
      setForm(emptyForm);
    }}
    className="bg-camp-forest hover:bg-camp-pine text-white text-sm font-medium py-2.5 px-5 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
  >
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.5v15m7.5-7.5h-15"
      />
    </svg>
    Add Reservation
  </button>
)}
```

- [ ] **Step 8: Disable the form's submit button**

At line 486-496, the form submit button. Update to:

```tsx
<button
  type="submit"
  disabled={saving || isOffline}
  title={isOffline ? "Connect to the internet to save" : undefined}
  className="bg-camp-forest hover:bg-camp-pine text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
>
  {saving
    ? "Saving..."
    : editingId
    ? "Save Changes"
    : "Add Reservation"}
</button>
```

- [ ] **Step 9: Verify typecheck + lint clean**

```bash
npm run typecheck && npm run lint
```

Expected: both exit 0.

- [ ] **Step 10: Manual test the gating**

Run `npm run dev`. Open a trip's `/reservations` page online — confirm all buttons enabled. Open DevTools → Network → Offline. Expected: every button (Add Reservation, Edit per row, Delete per row, Save in form) is visually disabled and hovering shows the tooltip. Click any disabled button — no action.

Toggle back online — buttons re-enable.

- [ ] **Step 11: Commit**

```bash
git add app/dashboard/trips/\[tripId\]/reservations/components/ReservationsClient.tsx
git commit -m "$(cat <<'EOF'
SPEC-008b.1 (10/12): gate ReservationsClient edits via useIsOffline

Disables Add / Edit / Delete / Save buttons when offline with a
tooltip explaining why. Submit error path now distinguishes
offline-induced failure from other errors.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Apply the gating pattern across packing, meals, tasks, grocery

Goal: replicate Task 10's pattern (disabled buttons, offline-aware error catches) across every mutation entry point in the other trip-scoped routes. Wide but shallow — ~15-20 component edits.

**Files:**
- Modify: all client components under `app/dashboard/trips/[tripId]/{packing,meals,tasks,grocery}/components/` that render mutation buttons or call mutating queries.

- [ ] **Step 1: Enumerate affected files**

Run this to produce the file list:

```bash
grep -rln 'onClick=\|onSubmit=\|handleSubmit\|handleDelete\|handleAdd\|handleEdit\|handleSave\|handleCheck' app/dashboard/trips/\[tripId\]/packing/ app/dashboard/trips/\[tripId\]/meals/ app/dashboard/trips/\[tripId\]/tasks/ app/dashboard/trips/\[tripId\]/grocery/ 2>/dev/null | sort -u
```

Save the resulting list. Each file in the list needs the treatment described in the following steps. Expected count: 8-15 files.

- [ ] **Step 2: For each file in the list, apply this pattern**

In every identified file:

(a) Add the import (if not already present):

```tsx
import { useIsOffline } from "@/app/pwa/OfflineContext";
```

(b) Inside the component function body, add (once):

```tsx
const isOffline = useIsOffline();
```

(c) For every `<button onClick={...}>` that triggers a *mutation* (adding, editing, deleting, marking complete, etc. — NOT pure-navigation buttons like "Cancel" or read-only toggles), add `disabled={isOffline}` and a `title={isOffline ? "<context-appropriate>" : undefined}` attribute. Tooltip copy guidance:
- Add buttons: `"Connect to the internet to add items"` (or meals / tasks / etc., matching domain).
- Edit buttons: `"Connect to the internet to edit"`.
- Delete buttons: `"Connect to the internet to delete"`.
- Check/uncheck buttons (packing checkboxes, task completion): `"Connect to the internet to update"`.

Append `disabled:opacity-50 disabled:cursor-not-allowed` to each affected button's `className` if not already there.

(d) For every `<form onSubmit={handleSubmit}>` or equivalent that calls a query function inside a `try/catch`, replace the catch body with the offline-aware pattern from Task 10 Step 2:

```tsx
} catch (err) {
  if (!navigator.onLine) {
    setError(
      "You're offline — your changes weren't saved. Try again when you're back online."
    );
  } else {
    setError(err instanceof Error ? err.message : "<existing fallback message>");
  }
}
```

Keep the existing fallback message verbatim — just wrap it with the offline check.

(e) For optimistic-mutation hooks (`useOptimisticMutation` per CLAUDE.md): if a component uses `useOptimisticMutation`, also gate the click handler so it bails when offline:

```tsx
const handleSomething = useCallback(() => {
  if (isOffline) return;
  // existing logic
}, [isOffline, /* existing deps */]);
```

This is belt-and-suspenders — the button is also `disabled={isOffline}`, but if a user keystrokes or scripts around it, we still bail.

- [ ] **Step 3: Verify typecheck + lint clean after each batch**

After modifying ~3-5 files, run:

```bash
npm run typecheck && npm run lint
```

If anything fails, fix immediately before moving on. It's cheaper to catch a missing import on one file than ten.

- [ ] **Step 4: Final typecheck + lint pass**

After all files are modified:

```bash
npm run typecheck && npm run lint
```

Expected: both exit 0.

- [ ] **Step 5: Manual smoke test across all four routes**

Run `npm run dev`. For each of `/packing`, `/meals`, `/tasks`, `/grocery` on a test trip:

1. Online: all buttons enabled, can perform mutations normally.
2. DevTools → Offline: all mutation buttons visually disabled with tooltips. Read-only displays still work.
3. Try clicking a disabled button: nothing happens.
4. Back online: buttons re-enable.

This is not exhaustive — leave the comprehensive run for the manual test log (Task 13). Right now we're confirming the pattern works on every route.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/trips/
git commit -m "$(cat <<'EOF'
SPEC-008b.1 (11/12): gate mutations across packing/meals/tasks/grocery

Replicates the Task 10 reservations pattern across every mutation
entry point in the four trip-scoped routes. ~12 files touched.
Submit catches now distinguish offline failure; buttons disable
with explanatory tooltips.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Clear `trip-pages` cache on sign-out

Goal: when a user signs out, evict their cached trip data so a subsequent sign-in (potentially as a different user) doesn't see stale trips.

**Files:**
- Modify: `app/dashboard/sign-out-button.tsx`

- [ ] **Step 1: Update `handleSignOut`**

Replace the entire file contents of `app/dashboard/sign-out-button.tsx` with:

```tsx
"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();

    // Clear cached trip data so a re-sign-in (possibly as a different user)
    // doesn't see another account's pages. Wrapped in try/catch so cache
    // failures cannot block the sign-out navigation.
    if (typeof caches !== "undefined") {
      try {
        await caches.delete("trip-pages");
      } catch {
        // Ignore — cache APIs can fail in private browsing modes.
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
```

- [ ] **Step 2: Verify typecheck + lint clean**

```bash
npm run typecheck && npm run lint
```

Expected: both exit 0.

- [ ] **Step 3: Manual test**

Run `npm run dev`. Sign in. Visit any trip — confirm DevTools → Application → Cache Storage → `trip-pages` has entries. Click "Sign out". Expected: redirected to `/login` and `trip-pages` is gone (or empty) in DevTools.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/sign-out-button.tsx
git commit -m "$(cat <<'EOF'
SPEC-008b.1 (12/12): clear trip-pages cache on sign-out

Prevents a subsequent sign-in (potentially as a different user)
from seeing the previous user's cached trip pages. Failures are
swallowed so cache problems cannot block sign-out.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: EXP-025 amendment, b-spec status update, manual test log

Goal: bookkeeping. Update the IDD artifacts so the b-spec sub-item flips to `shipped`, amend EXP-025 to drop the write-queue clause, and record the manual test pass.

**Files:**
- Modify: `docs/specs/SPEC-008b.yaml`
- Modify: the EXP-025 file (location TBD by grep below)
- Create: `docs/specs/SPEC-008b.1-test-log.md`

- [ ] **Step 1: Find the EXP-025 file**

Run:

```bash
grep -rln 'EXP-025\|"EXP-025"' docs/ | grep -v test-log
```

Expected: at least the parent `docs/specs/SPEC-008.yaml`. There may also be a dedicated expectation file under `docs/expectations/` — if so, that's the canonical home for the EXP-025 narrative. Read the file(s) returned and identify the one containing the full EXP-025 description with edge cases.

- [ ] **Step 2: Amend EXP-025**

In the file found above, locate the edge-case bullet:

> "User edits a reservation while offline; changes are queued locally and synced when connectivity returns, with conflict resolution if the record was also modified by another user online."

Replace it with:

> "User attempts to edit a reservation while offline; mutation buttons are disabled with a tooltip explaining editing is paused. Form contents are not lost — the user can re-submit when connectivity returns."

Also locate and update the storage-prioritization edge case:

> "PWA cache storage is nearly full on the device; the app degrades gracefully, prioritizing the most recent or upcoming trip's reservation data and notifying the user if older trips cannot be cached."

Replace with:

> "PWA cache storage is constrained; the app relies on the browser's default LRU eviction. We do not implement custom prioritization. Users in this state may find older trips not cached."

Leave the other edge cases (never-cached trip clear-message, cleared-cache recovery) intact — they match what we built.

- [ ] **Step 3: Update SPEC-008b.yaml**

Open `docs/specs/SPEC-008b.yaml`. Find the SPEC-008b.1 sub-item block (starts around line 23 with `- id: "SPEC-008b.1"`). Add (or replace) its `status:` and `shipped_on:` fields, and add an `implementation:` block at the end of that sub-item. The block should reference this plan and the design doc:

```yaml
    - id: "SPEC-008b.1"
      summary: "PWA offline reservations (EXP-025)"
      status: "shipped"
      shipped_on: "YYYY-MM-DD"  # replace with the actual ship date
      problem: >
        # unchanged
      approach_hint: >
        # unchanged
      priority: "high"
      reason: "Removes a fictional feature; real value at campsites."
      complexity: "Large — service worker, install prompt, caching strategy, offline-first UX states."
      implementation: >
        Serwist on Turbopack (`@serwist/turbopack` + `serwist` + `esbuild`).
        StaleWhileRevalidate over a regex matcher on
        `/dashboard/trips/{uuid}{,/reservations,/packing,/meals}`.
        Cache name `trip-pages`, max 100 entries, 30-day TTL. Eager
        prefetch of the three sub-tabs from `CachePrefetcher` on
        trip detail page mount. `OfflineContext` + `useIsOffline()`
        feeds a sticky `OfflineBanner`, an `InstallButton` with
        iOS-Safari fallback hint, and disables mutation buttons
        across reservations / packing / meals / tasks / grocery.
        Four new `error.tsx` boundaries (first in the app) render
        a shared `OfflineEmptyState` when a route can't be served.
        Sign-out clears the `trip-pages` cache. Time-since-cache
        precision in the freshness label was deliberately dropped
        to avoid SW→client postMessage plumbing; the banner conveys
        the freshness signal. EXP-025 amended to drop the
        write-queue clause and the custom-prioritization clause.
        Design: docs/superpowers/specs/2026-05-25-pwa-offline-reservations-design.md
        Plan:   docs/superpowers/plans/2026-05-25-pwa-offline-reservations.md
        Manual test log: docs/specs/SPEC-008b.1-test-log.md
```

Then check the other two sub-items in SPEC-008b.yaml (SPEC-008b.2 and SPEC-008b.3). Per the earlier conversation context, both are already `shipped`. If they are, the parent's top-level `status:` can flip from `"backlog"` to `"shipped"` with a `shipped_on:` matching the ship date of this task. Replace lines 5-6 of the file:

```yaml
  status: "shipped"
  shipped_on: "YYYY-MM-DD"  # replace with actual date
```

- [ ] **Step 4: Run a fresh manual test pass and record it**

Run through every step in the spec's §6 test plan (24 steps). Do this on **both** desktop Chrome and iPhone Safari (installed PWA). Record each step's pass/fail + device + date in a new file `docs/specs/SPEC-008b.1-test-log.md` using this template:

```markdown
# SPEC-008b.1 Manual Test Log

**Tester:** Jason Robey
**Date:** YYYY-MM-DD
**Devices:**
- Desktop Chrome (version X.Y.Z) on macOS
- iPhone Safari (iOS version X) — PWA installed

## Test results

| # | Step | Chrome | iOS Safari | Notes |
|---|------|--------|------------|-------|
| 1 | Sign in, create test trip with reservation + packing item + meal | ✅ / ❌ | ✅ / ❌ | |
| 2 | Open dashboard, install PWA via button, confirm home-screen icon | ✅ / ❌ | ✅ / ❌ | |
| ... | (continue for all 24 steps from SPEC §6) | | | |
| 24 | Lighthouse audit on production preview → PWA installable + all PWA optimizations pass | ✅ / ❌ | n/a | |

## Anomalies

(Record anything unexpected, even if it didn't fail the step.)

## Sign-off

All 24 steps pass on both devices: **yes / no**
Lighthouse PWA audit clean on production preview: **yes / no**
EXP-025 amended in docs/: **yes / no**
```

Fill in all 24 rows. If any step fails, do **not** proceed to commit — fix the underlying issue (likely a regression from an earlier task or a missed edit in Task 11) and re-run.

- [ ] **Step 5: Final lint + typecheck**

```bash
npm run typecheck && npm run lint
```

Expected: both exit 0.

- [ ] **Step 6: Commit and final flag**

```bash
git add docs/
git commit -m "$(cat <<'EOF'
SPEC-008b.1: ship — amend EXP-025, flip b-spec status, log tests

EXP-025 write-queue and custom-eviction clauses dropped to match
shipped read-only scope. SPEC-008b.1 sub-item marked shipped with
an implementation reference. Parent SPEC-008b flipped to shipped
(all sub-items now ship). Manual test log committed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

After this commit, the only outstanding work in `docs/specs/` should be SPEC-010+ (if any have been opened) — the SPEC-001 → SPEC-009b chain is fully shipped.

---

## Self-review

**Spec coverage:**

- §1 Summary → covered by all tasks
- §2 Goals → Tasks 1-12 implement; Task 13 records
- §2 Non-goals → respected throughout (no write queue, no /shared offline, no custom eviction beyond what Serwist's ExpirationPlugin provides, no dashboard cache indicator, no in-app reset)
- §3.1 Service Worker → Tasks 1 (skeleton) + 4 (real strategy)
- §3.2 Client islands → Tasks 3 (Context), 5 (Prefetcher), 6 (Banner), 7 (InstallButton), 8 (CacheFreshness — simplified), 9 (EmptyState)
- §3.3 Cross-cutting → Tasks 3 (Context+hook), 9 (error boundaries), 10-11 (edit-button gating), 12 (sign-out cache clear)
- §3.4 Manifest → Task 2
- §3.5 File inventory → cross-checked: every "new" file and every "modified" file is touched by at least one task ✅
- §4 Data flow scenarios A-E → exercised by Tasks 4, 5 (Scenarios A/B), 6+10+11 (Scenario C edit gating), 9 (Scenario D), implicit (Scenario E) — and verified end-to-end in Task 13's 24-step run
- §5 Error handling → Cases 1-3 handled by Serwist defaults; Case 4 inherent in SWR; Case 5 by Task 9; Case 6 by Tasks 10-11; Case 7 by Task 7 (iOS hint); Case 8 by Task 12
- §6 Testing → Task 13 manual log
- §7 EXP-025 amendment → Task 13
- §8 Implementation milestones → mapped 1-to-1 with tasks
- §9 Open questions → all resolved during planning: Serwist works on Next 16 (Task 1 spike), header trick replaced with simpler navigator.onLine check (CacheFreshness simplification), edit-button audit handled by Task 11's grep-then-iterate approach

**Placeholder scan:** searched for "TBD", "TODO", "fill in", "implement later". The only TBDs are:
- `YYYY-MM-DD` ship-date placeholders in Task 13 — these are fillable values, not unspecified work.
- "TBD by grep" in the EXP-025 file location — instructions then tell the engineer exactly how to find it.

Both are intentional and clearly resolved during execution. No spec-failure placeholders remain.

**Type consistency:** spot-checked:
- `useIsOffline()` returns `boolean` in OfflineContext (Task 3) and is consumed as `boolean` in every consumer (Tasks 6, 7, 10, 11).
- `OfflineEmptyState`'s `pageName` prop is `"trip" | "reservations" | "packing" | "meals"` in Task 9 and used with matching string literals in all four `error.tsx` boundaries.
- `CachePrefetcher` takes `tripId: string` in Task 5 and is mounted with `<CachePrefetcher tripId={tripId} />` in Task 5's page edit and Task 8's update of the same file.
- `BeforeInstallPromptEvent` type defined inline in Task 7; not referenced elsewhere.

**Scope check:** all tasks together cover SPEC-008b.1's full scope. No task addresses anything outside it. Tasks 10 and 11 are intentionally split (template-then-replicate) for reviewability; could be one task if executed inline.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-25-pwa-offline-reservations.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
