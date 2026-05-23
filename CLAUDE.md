# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Stack

- **Next.js 16.2.1** (App Router) — treat your training data as suspect. Breaking changes from 14/15 are real; read the relevant file under `node_modules/next/dist/docs/` before writing anything non-trivial.
- **React 19.2.4**, **TypeScript strict**, path alias `@/*` → repo root.
- **Tailwind CSS v4** via `@tailwindcss/postcss`. Theme tokens live in `app/globals.css` under `@theme inline` — custom `camp-*` palette (`camp-forest`, `camp-pine`, `camp-earth`, `camp-sky`, `camp-fire`, `camp-night`, `camp-sand`). Use these utility class names, don't hand-roll hex.
- **Supabase** (`@supabase/ssr` + `@supabase/supabase-js`) for Auth (Google OAuth), Postgres, and Realtime. No separate API layer — Server Components call Supabase directly.
- **Vercel AI Gateway** for AI features. Use the `ai` SDK with plain `"provider/model"` strings (e.g. `"anthropic/claude-sonnet-4.6"`); do not import provider-specific packages. Production auths via OIDC automatically; local dev needs `AI_GATEWAY_API_KEY` or a freshly-pulled `VERCEL_OIDC_TOKEN` (via `vercel env pull`, ~12h TTL).

## Commands

```bash
npm run dev      # next dev
npm run build    # next build
npm run start    # next start (prod)
npm run lint     # eslint (flat config in eslint.config.mjs)
```

No test runner is configured. There is no typecheck script — use `npx tsc --noEmit` if you need one.

Env vars required at runtime: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. AI features additionally need `AI_GATEWAY_API_KEY` (local dev) or `VERCEL_OIDC_TOKEN` (auto-provided on Vercel).

## Architecture

### Supabase client split (`lib/supabase/`)

Three entry points — pick based on where you are:

- `server.ts` — `createClient()` for Server Components / Route Handlers / Server Actions. Reads cookies via `next/headers`. The `setAll` catch is intentional: it swallows the "cannot set cookies from Server Components" error, relying on the root `proxy.ts` to refresh sessions.
- `client.ts` — browser-side singleton for Client Components.
- `middleware.ts` — `updateSession()` used by the root `proxy.ts`. Refreshes the session on every request and enforces auth redirects. (The file name is Supabase convention; despite the name it is not a Next file-convention middleware.)

### Auth & routing

`proxy.ts` at the repo root guards the entire app (Next 16 renamed the `middleware` file convention to `proxy`). Public routes: `/`, `/login`, `/auth/*`, `/shared/*`. Everything else redirects to `/login` when unauthenticated; `/login` redirects to `/dashboard` when authed. The matcher excludes Next internals and static assets.

- `app/login/` — Google OAuth entry
- `app/auth/` — OAuth callback
- `app/dashboard/` — authenticated app
- `app/shared/[token]/` — public read-only trip view for non-users (guest sharing, SPEC-009)

### Data access pattern

All database access goes through `lib/queries/<domain>.ts` modules (`trips`, `packing`, `meals`, `tasks`, `grocery`, `inventory`, `reservations`, `journal`, `sharing`). Each function takes a `SupabaseClient` as its first arg so the same helpers work from server and client contexts. **Don't inline `supabase.from(...)` calls in page or component code — add/extend a query module.** Types live in `lib/types/<domain>.ts`.

Server Components typically fan out with `Promise.all([...])` over multiple query helpers (see `app/dashboard/trips/[tripId]/page.tsx` for the readiness-card pattern).

`lib/queries/meals.ts` captures a `recipe_snapshot` (jsonb) on `addMeal` and `updateMeal` whenever a `recipe_id` is written — do not remove this or skip `fetchSnapshot`; it is the frozen history read by `MealEditModal` on completed trips (SPEC-005b.3). Migration 019 adds a BEFORE UPDATE trigger that enforces snapshot immutability at the DB layer on completed trips; any write attempt raises an exception regardless of the caller's RLS scope.

AI calls live under `lib/ai/<feature>.ts` (`server-only`) and are invoked from co-located `actions.ts` Server Actions (e.g. `app/dashboard/trips/[tripId]/meals/actions.ts`). The AI module returns typed values; the action handles authz (re-fetching the trip server-side) and wraps the call in an `{ ok: true | false }` discriminated union so the client can render structured errors. See `lib/ai/meal-suggestions.ts` for the canonical pattern: `generateText` + `Output.object` + a Zod schema.

### Realtime & optimistic updates (`lib/realtime/`)

**Per-feature channels, not one-channel-per-trip.** Each feature subscribes to its own Supabase channel. The provider manages presence only.

- `RealtimeProvider.tsx` wraps the trip subtree (via `app/dashboard/trips/[tripId]/layout.tsx`) and owns a single presence channel (`presence:${tripId}`) with exponential-backoff reconnect and `onAuthStateChange` cleanup on sign-out. **The provider owns the presence callbacks and `channel.track()` calls** — Supabase Realtime throws if `.on("presence", ...)` is registered after `subscribe()`, so handlers must be attached before subscribe. The provider takes `profile` as a prop and exposes `{ channel, connectionStatus, presentUsers }` via context.
- `usePresence.ts` + `PresenceAvatars.tsx` — `usePresence()` is a thin reader returning `{ presentUsers }` from context; `PresenceAvatars` takes no props. Mounted once in `TripRealtimeShell`. **Never** call `.on("presence", ...)` from a consumer — it will throw at runtime.
- `useRealtimeSubscription.ts` — generic hook that creates **its own channel** for Postgres changes on a single table/filter. Handlers are registered before `subscribe()` is called (Supabase silently drops late `.on()` calls). Use this for trip-row subscriptions (`useRealtimeTrip.ts`) or anywhere you want a declarative postgres_changes hook. The hook tears down the channel on unmount or filter change.
- **Feature clients (packing/grocery/tasks) currently create their own ad-hoc per-list channels** (e.g. `packing-${listId}`). This is the canonical per-feature pattern — do not force them through `useRealtimeSubscription` or the provider. `PackingListClient.tsx` is the reference implementation.
- `useOptimisticMutation.ts` + `optimistic.ts` — standard pattern for client-side edits: apply locally, await Supabase write, reconcile the server response against what you attempted to write. `onConflict` fires with `{ field, attemptedValue, serverValue }` tuples when another writer beat you to it.

### Database (`supabase/migrations/`)

Schema lives in numbered SQL migrations (`001_initial_schema.sql` → `019_recipe_snapshot_immutable.sql`). These are the source of truth — there are no generated types; hand-written TS types in `lib/types/` mirror the schema. **Every table has RLS enabled**; writing queries without thinking about `auth.uid()` / `trip_members` membership will silently return empty results. When adding a table, add the migration AND the RLS policies in the same file. Use the `public.is_trip_member_of(trip_id, user_id)` and `public.is_trip_planner(trip_id)` security-definer helpers (migrations 002/009) inside policies — do NOT write recursive `EXISTS (SELECT ... FROM trip_members)` checks; that footgun was already fixed once in migration 009.

Roles on `trip_members`: `planner` (full CRUD) vs `viewer` (read-only). Respect this at the UI layer too — `getUserRoleForTrip` is the canonical check.

## Specs & IDD workflow

`docs/` holds the Intent-Driven Development artifacts: `products/`, `intentions/` (INT-*), `expectations/` (EXP-*), `specs/` (SPEC-*.yaml), `reviews/`. Features are built spec-by-spec. SPEC-001 through SPEC-009 cover the original app surface; follow-up backlog specs are SPEC-003b through SPEC-009b (each parent spec's retro deferred-list, promoted to schedulable stubs with a `scope:` array of sub-items like `SPEC-006b.1`). Each sub-item carries its own `status:` — `backlog` until picked up, `shipped` with `shipped_on:` + `implementation:` when done. When asked to implement or extend a feature, check `docs/specs/` for the matching parent spec AND the b-spec stub for any deferred items before coding — the validation criteria and edge cases there are authoritative.
