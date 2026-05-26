# SPEC-008b.1 — PWA Offline Reservations (Design)

**Spec ID:** SPEC-008b.1
**Parent:** SPEC-008b (Reservations + history follow-ups)
**Related expectation:** EXP-025 (will be amended — see §7)
**Date:** 2026-05-25
**Owner:** Jason Robey
**Status:** Design approved; ready for implementation plan.

---

## 1. Summary

Make the camp-planner installable as a PWA and serve cached trip pages when the user is offline. Scope is **read-only across four trip-scoped routes**: trip detail, reservations, packing, meals. No offline editing, no write queue, no conflict resolution.

This closes EXP-025's "fiction debt" — the parent SPEC-008 advertised PWA offline reservations but shipped no service worker, no cache strategy, no install prompt.

## 2. Goals & non-goals

### Goals
- Users can install the app to their phone home screen via an explicit, dismissable button.
- After a user has opened a trip while online, that trip's detail, reservations, packing, and meals pages render correctly while offline.
- Users know clearly when they are offline and when the data they are looking at is from cache.
- Users in airplane mode at a campsite can read their reservation details without surprise.

### Non-goals (deliberate)
- **No offline edits.** All mutation paths are disabled when offline. EXP-025's write-queue + conflict-resolution clause is dropped (§7).
- **No offline support for `/shared/[token]`.** The PWA is for authenticated planners.
- **No storage-budget eviction logic.** Browser LRU is sufficient at our scale.
- **No "force refresh" button, retry queue, or stale-data notifications.**
- **No dashboard indicator for which trips are cached.** Deferred for polish later; users will discover this naturally.
- **No in-app "reset offline cache" button in v1.** Deferred as a follow-up.

## 3. Architecture

Three moving pieces, each with one job.

### 3.1 Service Worker
- **File:** `app/sw.ts`, compiled via Serwist's Next.js build plugin.
- **Library:** `serwist` + `@serwist/next`. Chosen because it's the only actively-maintained, Next-13+/App-Router-aware option. A 30-minute compatibility spike with Next 16 is the first implementation task.
- **Behaviour:**
  - **Trip routes** (regex: `^/dashboard/trips/[0-9a-f-]+(/(reservations|packing|meals))?/?$`): **stale-while-revalidate**, named cache `trip-pages`, `maxEntries: 100`, `maxAgeSeconds: 30 days`. **Matcher must also catch Next 16's RSC variant requests** for these same paths (same URL with an `RSC: 1` request header and/or a `?_rsc=…` query param — exact shape verified during the Next 16 spike). Both the HTML navigation and the RSC payload need to be cached under the same effective key so re-navigation works offline.
  - **Static assets:** Serwist's `defaultCache` (cache-first for hashed assets, stale-while-revalidate for fonts/images).
  - **Everything else:** network-only. Not intercepted.
- **Cache hit on offline-with-cache:** serve cache; inject `X-Served-From-Cache: true` and `X-Cached-At: <unix-seconds>` response headers (via a Serwist plugin hook).
- **Cache miss on offline-with-no-cache:** return a synthetic `504` so the route's `error.tsx` can render an offline empty state.
- **Lifecycle:** `skipWaiting: true`, `clientsClaim: true`. New SW activates on next navigation. Runtime `trip-pages` cache survives deploys (we want offline data to persist across releases).

### 3.2 Client islands

| Component | Where mounted | Purpose |
|---|---|---|
| `register-sw.ts` (no UI) | root `app/layout.tsx` | Registers the SW. Try/catch + `console.warn` on failure. |
| `InstallButton.tsx` | `app/dashboard/layout.tsx` header | Listens for `beforeinstallprompt`, shows install button when installable AND not dismissed. iOS-specific hint when running iOS Safari and not in standalone mode. |
| `OfflineBanner.tsx` | `app/dashboard/layout.tsx` (sticky top) | Listens to `navigator.onLine` + `online`/`offline` events. Writes state to `OfflineContext`. |
| `CachePrefetcher.tsx` | `app/dashboard/trips/[tripId]/page.tsx` | On mount, after 1s delay, fires three background `fetch()` calls for `/reservations`, `/packing`, `/meals` so the SW intercepts and caches them. |
| `CacheFreshness.tsx` | Trip-scoped pages, near title | Reads `X-Served-From-Cache` / `X-Cached-At` response headers from the page's own RSC response (via a small `useEffect` calling `fetch` with `{ cache: 'no-store' }` then inspecting headers). Shows `cached · X min ago` label when present. |
| `OfflineEmptyState.tsx` | Rendered inside per-route `error.tsx` boundaries | Single reusable component, prop `pageName: "trip" \| "reservations" \| "packing" \| "meals"`. |

### 3.3 Cross-cutting

- **`OfflineContext`** + **`useIsOffline()` hook**: single source of truth for offline state, fed by `OfflineBanner`. Consumed by edit buttons and form submit handlers across packing, grocery, meals, reservations, tasks. Edit buttons render disabled with tooltip "Connect to the internet to make changes" when offline.
- **Inline error pattern** (existing): the codebase surfaces mutation errors via `useState<string | null>` rendered inline in forms (`ReservationsClient.tsx` is the canonical example). We extend this pattern — no new toast library. New error case to add to each form: if the action fails AND `navigator.onLine === false`, set error to "You're offline — your changes weren't saved. Try again when you're back online."
- **`error.tsx` boundaries**: three new files, one per sub-route (`reservations`, `packing`, `meals`). Each is identical: `'use client'` → check `navigator.onLine` → render `<OfflineEmptyState pageName="..." />` if offline, else render the default error UI (an `error.message` + "Try again" button). One additional boundary in `app/dashboard/trips/[tripId]/error.tsx` for the trip detail page itself. **These are the first `error.tsx` files in the app** — set up cleanly for reuse later.

### 3.4 Manifest

Expand `public/manifest.json`:
- Add `scope: "/"`, `description`, `categories: ["productivity", "lifestyle"]`.
- Confirm 192×192 + 512×512 icons exist (they do).
- Optional: add a few screenshots for richer install UI on Android. Defer if it requires design work.

### 3.5 File inventory

**New files:**
- `app/sw.ts`
- `app/pwa/register-sw.tsx`
- `app/pwa/InstallButton.tsx`
- `app/pwa/OfflineBanner.tsx`
- `app/pwa/OfflineContext.tsx`
- `app/pwa/CachePrefetcher.tsx`
- `app/pwa/CacheFreshness.tsx`
- `app/pwa/OfflineEmptyState.tsx`
- `app/pwa/useIsOffline.ts`
- `app/dashboard/trips/[tripId]/error.tsx`
- `app/dashboard/trips/[tripId]/reservations/error.tsx`
- `app/dashboard/trips/[tripId]/packing/error.tsx`
- `app/dashboard/trips/[tripId]/meals/error.tsx`

**Modified files:**
- `next.config.ts` — wrap in `withSerwist`.
- `package.json` — add `serwist`, `@serwist/next` deps.
- `public/manifest.json` — expand.
- `app/layout.tsx` — mount `<SwRegister />`.
- `app/dashboard/layout.tsx` — mount `<OfflineBanner />`, `<InstallButton />`, wrap children in `<OfflineProvider>`.
- `app/dashboard/trips/[tripId]/page.tsx` — mount `<CachePrefetcher tripId={tripId} />`.
- The four trip pages (`page.tsx` in trip detail / reservations / packing / meals) — mount `<CacheFreshness />`.
- All edit-button entry points across packing, grocery, meals, reservations, tasks — gate via `useIsOffline()`. Wide-but-shallow audit needed (~15–20 components).
- All mutation handlers in same components — extend existing `setError(...)` pattern with the offline-friendly message.
- `app/login/actions.ts` (or wherever sign-out lives) — on successful sign-out, call `caches.delete("trip-pages")`.

## 4. Data flow (five scenarios)

### A. First visit to a trip (online)
1. User navigates to `/dashboard/trips/[id]` → SW intercepts, no cache → fetches network, stores in `trip-pages`, returns.
2. Page renders. `CachePrefetcher` mounts, waits 1s, fires three background fetches.
3. SW intercepts each, caches, returns silently.
4. **End state:** four cache entries written.

### B. Returning visit (online)
1. User navigates → SW cache hit → **stale-while-revalidate**: returns cached immediately, fetches fresh in background, updates cache.
2. `CacheFreshness` shows `cached · X min ago` briefly.
3. Background revalidation completes ~200ms later. **No automatic re-render.** User sees stale data until next nav or refresh.
4. **Trade-off accepted:** matches Next's own RSC cache feel. If wrong, switch to network-first with timeout (revisit post-ship).

### C. Offline, cached trip
1. User opens installed PWA in airplane mode → `/dashboard` (cached).
2. `OfflineBanner` shows; `OfflineContext` flips; edit buttons disable.
3. Navigation → SW cache hit → cached pages render.
4. `CacheFreshness` shows `cached · 2 hr ago` etc.

### D. Offline, uncached trip
1. User opens a trip never opened online → SW cache miss + network fails → synthetic `504`.
2. Route's `error.tsx` catches → renders `<OfflineEmptyState pageName="trip" />`.
3. "Try again" button → `router.refresh()` → still offline → same empty state.

### E. Back online
1. `online` event fires → banner disappears → edit buttons re-enable.
2. **No automatic re-fetch of all pages** (thundering herd). Convergence happens via:
   - SWR background revalidation on next navigation.
   - Existing `VisibilityRefresher` (commit `497c548`) refreshes the current route on tab focus.
   - Existing per-feature realtime channels reconnect and push fresh data.

### Cross-cutting
- **Auth & session:** the SW caches whatever response the server returned with cookies attached at the time. User sees what they were authorized to see *at cache time*. No Supabase token refresh while offline (matches every offline-capable app).
- **Cache size:** ~5–20KB per RSC page × 100 entries → ~1–2MB. Well under browser quotas.
- **Realtime:** WebSocket connections fail offline, succeed online. SW does not intercept. No interaction.

## 5. Error handling

| # | Failure | Handling |
|---|---|---|
| 1 | SW registration fails on first load | `console.warn`, app continues exactly as today. No banner. |
| 2 | SW becomes corrupted | Serwist `skipWaiting`+`clientsClaim` swap new SW in. If install errors, old SW keeps serving. No in-app reset button v1. |
| 3 | Cache write fails (quota) | SW catches, serves network response, retries on next request. Invisible to user. |
| 4 | Network fails during SWR revalidation | Silent. Cache not updated. Retried next request. Edge case: pre-edit data shown briefly with "cached · just now" label. Acceptable. |
| 5 | Cache miss + offline | Synthetic 504 → `error.tsx` → `OfflineEmptyState`. |
| 6 | Edit clicked just as connection drops | Action fails → existing `setError(...)` extended with offline message. |
| 7 | iOS Safari quirks | No `beforeinstallprompt`: show "Add to Home Screen" hint. Cache budget ~50MB (we use 1–2MB). **Known limitation:** iOS evicts SW after ~7 days non-use; user reopens → SW re-registers → cache rebuilds. Documented, not engineered around. |
| 8 | Sign out while offline | Action fails → friendly error. Cached data remains until sign-out completes online (which calls `caches.delete("trip-pages")`). **Security note:** matches existing Supabase-cookie behaviour, not a regression. |

**Not handled (YAGNI):** retry queues, force-refresh buttons, fresh-data toasts, conflict UIs.

## 6. Testing

No test runner is configured. This is manual + cheaply-automated.

### Manual test plan
Run on **iPhone Safari (PWA installed)** + **desktop Chrome**. Record results in `docs/specs/SPEC-008b.1-test-log.md` when shipping.

1. Sign in, create test trip with reservation + packing item + meal.
2. Open dashboard, install PWA via button, confirm home-screen icon.
3. Open installed PWA, navigate to trip detail. Wait 2s. DevTools → Cache Storage → `trip-pages` → confirm 4 entries.
4. Navigate to `/reservations` → confirm `cached · just now` label flashes, page renders.
5. Reload → confirm `cached · X min ago` (SWR hit).
6. Add a packing item online → persists, no offline banner.
7. Airplane mode → reload `/reservations` → banner shown, cached data, label visible, edit buttons disabled with tooltip.
8. Click a disabled edit button → tooltip, no action.
9. Navigate to `/packing` and `/meals` → both render from cache.
10. Pull to refresh → still cached, no errors.
11. (Airplane on) open a trip never opened online → `OfflineEmptyState` for trip detail.
12. Navigate to its `/reservations` → empty state with correct `pageName`.
13. "Try again" → still offline → empty state remains.
14. Disable airplane mode → banner disappears → edit buttons re-enable.
15. Navigate around → fresh data converges via SWR + realtime.
16. Previously-uncached trip now loads.
17. Make an edit → succeeds.
18. Mid-action: start typing in "Add reservation," enable airplane, Save → error shows "You're offline …".
19. Sign out while offline → friendly error.
20. Sign out while online → `trip-pages` cache cleared (Cache Storage empty).
21. iOS only: confirm "Add to Home Screen" hint appears (no `beforeinstallprompt` fires on iOS).
22. iOS only: install via Share sheet, reopen as PWA → works.
23. Deploy a visible code change → reopen PWA → confirm new version active within one navigation.
24. Lighthouse audit on production preview → PWA installable + all PWA optimizations pass.

### Automated
- **Lighthouse PWA audit** as a Vercel deployment check.
- `npm run typecheck` and `npm run lint` clean.
- No Playwright SW tests (flaky, low ROI).
- No new test runner introduced for this spec.

### Acceptance
Ships when all 24 manual steps pass on both devices, Lighthouse clean, typecheck + lint clean, EXP-025 amended (§7), and test log committed.

## 7. EXP-025 amendment

The parent EXP-025 currently includes:

> "User edits a reservation while offline; changes are queued locally and synced when connectivity returns, with conflict resolution if the record was also modified by another user online."

**Drop this edge case.** Replace with:

> "User attempts to edit a reservation while offline; the app indicates editing is paused while offline and the change is not lost from the form. When connectivity returns, the user can resubmit."

Also tighten the storage-prioritization edge case to match reality (we don't implement custom eviction; browser LRU handles it). Update the validation criteria narrative in the parent spec to reflect read-only scope.

These edits land in the same PR as the implementation.

## 8. Implementation milestones

Recommended sequence (the implementation plan will refine these):

1. **Serwist + Next 16 spike** (30 min) — verify the build plugin works on Next 16.2.6.
2. **SW + manifest + register** — minimal SW caching trip routes; install button.
3. **Offline banner + context + hook + edit-button gating audit** — wire offline awareness through the app.
4. **CachePrefetcher** — eager prefetch of the three sub-tabs.
5. **CacheFreshness + cache-injected response headers** — staleness labels.
6. **`error.tsx` boundaries + OfflineEmptyState** — uncached-while-offline UX.
7. **Sign-out cache clear** — on sign-out callback, `caches.delete("trip-pages")`.
8. **Manual test pass** on both devices, record in test log.
9. **EXP-025 amendment** + b-spec sub-item status flip to `shipped`.

## 9. Open questions for the implementation plan

- **Serwist + Next 16 compatibility.** If the build plugin doesn't work cleanly, fallback is hand-rolled SW with Workbox primitives (Approach B from brainstorming). Decision deferred to milestone 1.
- **`CacheFreshness` header trick.** If injecting headers via Serwist plugin proves messy, fallback is a SW→client `postMessage` channel.
- **Edit-button audit.** Exact count of components touched is TBD; expect 15–20. Implementation plan will enumerate.
