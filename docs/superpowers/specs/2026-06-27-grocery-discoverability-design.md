# Grocery List discoverability — design

**Date:** 2026-06-27
**Status:** approved, ready for implementation plan
**Author:** Jason Robey (with Claude)

## Problem

The grocery list feature is fully built and shipped (SPEC-006, SPEC-006b) — query
layer, RLS, realtime, and a complete UI at `/dashboard/trips/[tripId]/grocery`
(generate-from-meals, manual add, purchase toggles, add-to-inventory,
post-trip reconcile). But it is **unreachable from the UI**: the trip detail
page renders a "Trip Readiness" grid of four cards (Packing, Meals, Tasks,
Reservations) and there is no Grocery card. There is no per-trip tab bar, so
those readiness cards are the only entry points into a trip's sub-features. The
grocery route is therefore an orphan — nothing links to it, and the only place
the list can be generated (the "Generate from Meals" button) lives on a page no
one can navigate to.

This is why grocery "doesn't appear in the UI" and there is "no way to generate
the list." It is a missing navigation link, not a missing feature.

## Goal

Make the existing grocery feature discoverable and usable with the smallest
change that fits established patterns. Defer any behavioral changes until the
feature has actually been used.

## Scope (Phase 1)

Two UI wiring edits. No query-layer, schema, RLS, or behavioral changes.

### 1. Grocery readiness card

File: `app/dashboard/trips/[tripId]/page.tsx`

- Add `getGroceryProgress(supabase, tripId)` to the existing `Promise.all`
  fan-out. It already exists in `lib/queries/grocery.ts` and returns
  `{ total, purchased } | null`.
- Render a `ReadinessCard` in the existing grid, matching the Packing card:
  - `icon="🛒"`, `title="Grocery"`
  - `status`: `empty` when no progress or `total === 0`; `complete` when
    `purchased === total`; otherwise `in_progress`.
  - `percentage`: `Math.round((purchased / total) * 100)` when `total > 0`,
    else `0`.
  - `detail`: `"{purchased}/{total} items purchased"` when `total > 0`.
  - `emptyMessage`: `"No grocery list yet — tap to get started"`.
  - `href`: `/dashboard/trips/${tripId}/grocery`.

This alone resolves "I don't see Grocery in the UI."

### 2. Menu-page link to the grocery page

File: `app/dashboard/trips/[tripId]/meals/page.tsx`

- Add a "🛒 Grocery List →" link in the Meal Plan page header (the
  `flex items-center justify-between` row that currently holds only the title)
  that navigates to `/dashboard/trips/${tripId}/grocery`.
- A plain `next/link` styled as a button. No generation logic is duplicated —
  the canonical "Generate from Meals" button already lives on the grocery page.
  This keeps a single source of truth for generation.

## Explicitly out of scope (deferred)

These were discussed and intentionally postponed until the reachable feature has
been used and the need confirmed:

- **Confirm before adding duplicate items.** Today `addGroceryItem` dedupes
  manual adds by `(name, unit)` silently (SPEC-006b.3), and regeneration
  preserves manual items and purchased state. A user-facing confirmation step is
  a behavioral change, not needed to make the feature usable.
- **Transfer purchased items to the packing list.** Today purchased items
  transfer to camper *inventory* (SPEC-006b.4). Routing them to the trip packing
  list as open `food` items is a new flow that may or may not be wanted once the
  inventory flow is visible in use. Decide after Phase 1.

## Risks / notes

- `getGroceryProgress` returns `null` for a trip with no list or no items — the
  card must treat `null` as the `empty` state (same shape as the other progress
  helpers).
- No new permission surface: the grocery page already gates planner-only actions
  via `getUserRoleForTrip`; the card is a read-only link visible to all members,
  consistent with the other readiness cards.
