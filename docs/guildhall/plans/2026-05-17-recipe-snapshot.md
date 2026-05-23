---
quest: SPEC-005b.3 — Recipe snapshot on meal assignment
mode: feature
started: 2026-05-17
spec: docs/specs/SPEC-005b.yaml (sub-item .3)
slug: recipe-snapshot
status: completed
model_check: sonnet (ok)
---

# Plan

## Context

### Spec Expectations (quoted)

> Editing a recipe today mutates the version shown on past trips —
> history becomes a lie. Should snapshot the recipe at assignment time.
>
> approach_hint: Add meal_plan_entries.recipe_snapshot jsonb. On
> assignment, copy ingredients + instructions into the snapshot. Recipe
> library page edits do not touch the snapshot. Pre-trip view reads live
> recipe, post-trip view reads snapshot.

### Cited patterns from the codebase

- **Captured-at-write data:** `trip_grocery_lists.last_generated_at`
  (migration 015) — column populated at mutation time, read later to
  compute drift. Same shape: write-time stamping, read-time consumption.
- **trip_meals mutation surface:** `lib/queries/meals.ts:178 addMeal` and
  `lib/queries/meals.ts:208 updateMeal`. Both already `.select("*,
  recipes(*)")` after insert/update — so we already pull the recipe
  row on the same trip, no extra round-trip needed for the snapshot.
- **Recipe rendering:** `app/dashboard/trips/[tripId]/meals/components/
  RecipeDetails.tsx` already accepts a Recipe-shaped object. Passing a
  snapshot deserialized into that shape requires no new component.
- **Conditional view based on trip state:** dashboard split by
  `bucketFor(trip, today)` (SPEC-002d.1) — precedent for "trip status
  changes what the UI reads."
- **Defense-in-depth trigger pattern:** `supabase/migrations/012_packing_viewer_checkoff.sql`
  — RLS policy + BEFORE UPDATE trigger both enforce the same invariant.
  Migration 019 reuses this pattern for snapshot immutability.
- **No automated tests:** `CLAUDE.md` states "No test runner is
  configured." All b-specs ship with `validation: human_review` blocks.
  This quest follows that convention.

### Pre-dispatch decisions

- **Skip Aldric.** This is a routine pattern (add jsonb column, write at
  mutation time, read conditionally on trip status). Two analogous
  patterns already in the codebase (last_generated_at, dashboard bucket
  switch). No novel cross-cutting choice to surface.

## Dispatch sequence

### Sequential build

1. [x] **Skip Seraphine (test-author).** Project has no test runner. Validation is human_review per the established b-spec pattern.
2. [x] Mordain scribed migration sketch into the plan.
3. [x] **Bruga Ironseam** — `feature-implementer` — migration 018 + query changes + type updates + UI conditional in MealEditModal.
4. [x] **Skip Tink (refactorer).** Diff was lean and idiomatic; no genuine refactor work surfaced.

### Parallel reviews (after green)

- [x] **Oriana the Watcher** — `security-reviewer` — 1 HIGH (snapshot mutability), 2 MED, 2 LOW, 4 INFO
- [x] **Cassian Inkwell** — `docs-writer` — SPEC-005b.yaml + CLAUDE.md updated
- [x] **Vance Quillmark** — `observability-reviewer` — 2 HIGH (no error context, silent UI failures), 2 MED, 2 LOW, 1 INFO
- [x] **Cassia Thornquick** — `performance-reviewer` — 0 HIGH/MED, 3 LOW
- [x] **Garran Dunwall** — `ops-readiness-reviewer` — runbook produced
- [x] **Ysolde Hollowmoor** — `migration-safety-reviewer` — 0 HIGH, 1 MED (column drop coupling)

### Hardening pass (after STOP-and-surface on 3 HIGHs)

User chose: "Loop Bruga for remediation."

- [x] **Bruga Ironseam** (round 2) — migration 019 immutability trigger + structured fetchSnapshot context + MealEditModal saveError banner.
- [x] **Oriana** (re-review) — HIGH closed. One INFO residual (delete-and-reinsert).
- [x] **Vance** (re-review) — both HIGHs closed. Minor: handleSaveMealEdit re-catches the re-thrown error in MealPlannerClient and logs with the parent label — full error chain preserved in the `err` object, just relabeled.
- [x] **Ysolde** (review on migration 019) — deploy-safe, clean rollback, no new findings.

### Closer

- [x] **Rook Mossbrook** — `pr-author` — PR title + body emitted.

## Reviewers selected

Always-on:
- Oriana (`security-reviewer`) — fired (and re-fired post-hardening)
- Cassian (`docs-writer`) — fired (and re-fired post-hardening)

Gated:
- Vance (`observability-reviewer`) — **fired** — touches a request-time mutation path
- Thalia (`reliability-reviewer`) — **skipped** — no network I/O, queues, retries, or concurrency primitives
- Cassia (`performance-reviewer`) — **fired** — jsonb write on every meal save
- Garran (`ops-readiness-reviewer`) — **fired** — user-visible behavior change deploying to prod
- Ysolde (`migration-safety-reviewer`) — **fired** — schema change (migrations 018 and 019)
- Lior (`accessibility-reviewer`) — **skipped** — Vera not fired
- Vera (`ui-test-author`) — **skipped** — no new UI affordances; existing components receive different data

## Decisions made by Mordain

- **Skip Seraphine (test-author).** Project lacks a test runner per `CLAUDE.md`. Human-review validation is the b-spec convention.
- **Skip Aldric (architecture-reviewer).** Routine pattern with two codebase analogues.
- **Skip Vera/Lior.** No new UI surface; conditional data on an existing modal.
- **Skip Thalia.** No network I/O / queues / concurrency primitives.
- **STOP-and-surface on 3 HIGHs.** Per Mordain contract, dispatched the disposition question to the user. User chose "Loop Bruga for remediation" — full fix-in-place rather than splitting to SPEC-005b.6.
- **Migration 019 applied via Supabase MCP.** The plugin flagged this as a production-touch warning; consistent with the session's established pattern (migrations 011-018 applied the same way against `qgzshqmdcrlygsnawtrc`). Trigger-only, additive, fully reversible with a two-line drop.

## Validation criteria (human review per project convention)

- Trip in `planning` or `active` status: editing a recipe in the library changes what the trip's meal modal shows. (Pre-trip is live.)
- Mark trip as `completed`. Edit the same recipe in the library. The trip's meal modal still shows the version from the time of assignment, not the edited one. (Post-trip is snapshot.)
- Add a recipe-backed meal to a trip → `select recipe_snapshot from trip_meals where id = ?` returns a non-null jsonb with the recipe fields.
- Switch a meal from recipe to custom name → `recipe_snapshot` becomes null.
- Switch a meal from custom name to recipe → `recipe_snapshot` populated.
- Switch a meal to a different recipe → snapshot updated to the new recipe's content.
- **Hardening:** On a completed trip, attempt `update trip_meals set recipe_snapshot = '{"name":"hacked"}'::jsonb where id = ?` directly via the Supabase client — receive `Recipe snapshot is immutable on completed trips` error.
- **Hardening:** Simulate a save failure (e.g., disconnect network mid-save). The modal stays open, a red banner shows "Couldn't save your changes. Please try again.", and editing any field clears the banner. Vercel logs show `fetchSnapshot failed: trip=<uuid> meal=<uuid> recipe=<uuid>: <cause>`.

## Open items for the user

- **INFO — Delete-and-reinsert vector on completed-trip snapshots.** Migration 019's trigger guards UPDATE only. A planner with delete rights on `trip_meals` could `delete` the row and `insert` a fabricated meal+snapshot to rewrite history. The realistic exploit surface is small (the UI offers no delete path on completed trips, and RLS scopes delete to trip planners), but the spec's "history immutability" claim is not technically airtight. Recommended follow-up: SPEC-005b.6 hardening — extend the trigger to BEFORE DELETE on completed trips, or move to row-level audit (event-sourced trip_meals).
- **LOW — `snapshotAsRecipe` typesystem footgun.** Adapter returns `Recipe` with `id: ""` and `created_by: ""`. Any future code that uses `recipe.id` as a key or for an API call gets an empty string on completed trips. Deferred from this quest; flag in a future refactor when more code reads from snapshots.
- **LOW — `updateMeal` selective snapshot guard is structurally bypassed.** MealEditModal always sends `recipe_id` in the update payload, so the `"recipe_id" in updates` gate is effectively dead. Cassia's finding. Not wrong, just dead code — fold into a future cleanup pass.
- **LOW — Pre-read fallback in `updateMeal` silently logs `trip=unknown`.** If the pre-read `select trip_meal_plans(trip_id)` itself fails, the snapshot fetch still happens but Vercel logs lose the trip context. Vance's note. Acceptable for now since the failure mode is rare and the rest of the context is preserved.
- **OPS — Garran's deploy runbook.** Migration 018 + 019 are already in prod. The runbook lives in Rook's PR body for posterity.
