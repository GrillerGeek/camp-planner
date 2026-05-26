# SPEC-008b.1 Manual Test Log

**Spec:** SPEC-008b.1 — PWA offline reservations
**Branch:** `spec/008b.1-pwa-offline`
**Tester:** Jason Robey
**Date:** _TODO — fill in when running the test pass_
**Devices:**
- _TODO — Desktop Chrome (version X.Y.Z) on macOS_
- _TODO — iPhone Safari (iOS version X) — PWA installed_

## Test results

| # | Step | Chrome | iOS Safari | Notes |
|---|------|--------|------------|-------|
| 1 | Sign in, create test trip with at least one reservation + one packing item + one meal | | | |
| 2 | Open dashboard → install PWA via the "Install app" button; confirm home-screen icon appears | | | |
| 3 | Open installed PWA, navigate to trip detail. Wait 2s. DevTools → Application → Cache Storage → `trip-pages` → confirm 4 entries (trip detail + 3 sub-tabs) | | n/a | iOS DevTools requires Safari remote debugging |
| 4 | Navigate to `/reservations` → confirm "Showing cached data" label does NOT appear (online) | | | |
| 5 | Reload page → confirm page renders fast (SWR hit, "(ServiceWorker)" in Network tab) | | n/a | |
| 6 | Add a packing item online → persists, no offline banner | | | |
| 7 | Airplane mode → reload `/reservations` → confirm banner appears at top, cached data renders, "Showing cached data" label visible, edit buttons disabled with tooltips | | | |
| 8 | Click a disabled edit button (Add Reservation, Edit, Delete) → tooltip shown, no action | | | |
| 9 | Navigate to `/packing` and `/meals` → both render from cache, both show offline label | | | |
| 10 | Pull to refresh (or browser reload) → page still renders from cache, no errors | | | |
| 11 | (Airplane on) open a trip never opened online in this PWA install → `<OfflineEmptyState pageName="trip">` renders | | | |
| 12 | Navigate to its `/reservations` tab → empty state with `pageName="reservations"` | | | |
| 13 | Click "Try again" → still offline → empty state remains | | | |
| 14 | Disable airplane mode → banner disappears → edit buttons re-enable | | | |
| 15 | Navigate around → fresh data converges via SWR + realtime | | | |
| 16 | Previously-uncached trip now loads correctly | | | |
| 17 | Make an edit → succeeds | | | |
| 18 | Mid-action: start typing in "Add reservation" form, enable airplane, click Save → error shows "You're offline …" | | | |
| 19 | Sign out while offline → friendly error (can't sign out offline) | | | |
| 20 | Sign out while online → `trip-pages` cache cleared (Cache Storage empty in DevTools) | | n/a | |
| 21 | **iOS only:** confirm "Install: Share → Add to Home Screen" hint appears in dashboard header (no `beforeinstallprompt` fires on iOS) | n/a | | |
| 22 | **iOS only:** install via Share sheet, reopen as PWA → works | n/a | | |
| 23 | Deploy a visible code change → reopen PWA → confirm new version active within one navigation | | | |
| 24 | Lighthouse audit on production preview → PWA installable + all PWA optimizations pass | | n/a | |

Mark each cell ✅ / ❌. If failing, describe the failure in Notes.

## Anomalies

_Record anything unexpected, even if it didn't fail the step. Examples: brief flicker on banner appear, console warning about hydration mismatch, slower-than-expected SWR revalidation, install prompt's behavior in incognito vs regular browser._

## Drag-and-drop verification (added during implementation)

The MealPlannerClient supports drag-and-drop reordering. Code review of Task 11 caught that this was the only mutation path without a button-level `disabled` gate. Verify:

| # | Step | Pass/Fail | Notes |
|---|------|-----------|-------|
| D1 | Online: drag a meal card to a new slot → succeeds, persists | | |
| D2 | Airplane on: meal cards are NOT draggable (`draggable={isPlanner && !isOffline}`) | | |
| D3 | Airplane on: even if drag is somehow triggered, `handleMoveMeal` early-returns and no DB call fires (check Network tab) | | |

## Sign-off

- [ ] All 24 main test steps pass on both devices
- [ ] All 3 drag-and-drop checks pass
- [ ] Lighthouse PWA audit clean on production preview
- [ ] EXP-025 amended in `docs/expectations/EXP-025.yaml` (write-queue + custom-eviction clauses dropped)
- [ ] SPEC-008b.yaml updated: SPEC-008b.1 sub-item `status: shipped`, parent `status: shipped`

Once all boxes are checked, this spec is shipped.
