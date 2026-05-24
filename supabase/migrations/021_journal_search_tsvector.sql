-- SPEC-008b.2: full-text search across all journal entries.
--
-- The history page today fetches ONLY the latest entry per trip and
-- searches in JS. Older entries are invisible to search — "great
-- firewood" written on day 1 won't surface if day 5 says anything else.
-- This migration adds a tsvector column maintained by trigger, plus a
-- GIN index so search across all entries is index-backed.
--
-- We use 'english' config for stemming (firewood / firewoods both match).
-- If multilingual support becomes a real need later, switch to
-- 'simple' or a multi-config setup — for now English is fine.

-- ============================================================
-- 1. Column
-- ============================================================
alter table public.trip_journal_entries
  add column search_tsv tsvector;

-- ============================================================
-- 2. Trigger to keep search_tsv in sync with content
-- ============================================================
-- Fires BEFORE insert/update so the new row stores the computed tsv
-- without a second write. search_path locked per project convention.

create or replace function public.update_journal_entry_search_tsv()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_tsv := to_tsvector('english', coalesce(new.content, ''));
  return new;
end;
$$;

create trigger trip_journal_entries_search_tsv_sync
  before insert or update of content on public.trip_journal_entries
  for each row execute function public.update_journal_entry_search_tsv();

-- ============================================================
-- 3. Backfill existing rows
-- ============================================================
-- Trigger only fires on future writes; existing rows need a one-shot
-- backfill. Cheap on a small table; if this ever ships against a huge
-- production journal, switch to a batched migration.

update public.trip_journal_entries
  set search_tsv = to_tsvector('english', coalesce(content, ''));

-- ============================================================
-- 4. GIN index for fast tsvector lookups
-- ============================================================
-- GIN is the standard index type for tsvector @@ tsquery queries.
-- The combination of WHERE trip_id IN (...) AND search_tsv @@ tsquery
-- will use the existing idx_trip_journal_entries_trip_id for the
-- trip_id narrowing and this new index for the text match.

create index idx_trip_journal_entries_search_tsv
  on public.trip_journal_entries using gin (search_tsv);

-- ============================================================
-- 5. search_journal_entries RPC
-- ============================================================
-- SECURITY INVOKER so RLS still scopes results to the caller's trips
-- (i.e. trips they're a member of). Returns one row per matching entry;
-- the client dedupes to one snippet per trip.
--
-- ts_headline uses custom markers (« and ») rather than the default
-- <b></b> so the React client can safely split the string and wrap
-- matches in a <mark> element via normal text rendering. The « / »
-- characters are unlikely to appear in normal journal text but are
-- escaped at render time to be safe.
--
-- websearch_to_tsquery handles user-typed queries gracefully (supports
-- bare terms, quoted phrases, OR, negation) without ever throwing on
-- malformed input — unlike to_tsquery which is strict.

create or replace function public.search_journal_entries(_query text)
returns table (
  trip_id uuid,
  snippet text,
  created_at timestamptz
)
language sql
security invoker
stable
set search_path = ''
as $$
  select
    je.trip_id,
    ts_headline(
      'english',
      je.content,
      websearch_to_tsquery('english', _query),
      'StartSel=«, StopSel=», MaxFragments=1, MaxWords=20, MinWords=5'
    ) as snippet,
    je.created_at
  from public.trip_journal_entries je
  where je.search_tsv @@ websearch_to_tsquery('english', _query)
  order by je.created_at desc;
$$;

grant execute on function public.search_journal_entries(text) to authenticated;
