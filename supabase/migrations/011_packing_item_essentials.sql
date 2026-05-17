-- Phase: SPEC-002c.3
-- Add is_essential to trip_packing_items so the flag set on
-- packing_template_items can propagate when a template is applied.
--
-- packing_template_items.is_essential existed since migration 002 but
-- trip_packing_items had no parallel column, so the flag was silently
-- dropped during applyPackingTemplate / autoPopulateFromTemplates.
-- Surfaced by the 2026-05-16 UX audit as finding A3.

alter table public.trip_packing_items
  add column if not exists is_essential boolean not null default false;

-- Index on the partial set of essentials. Optional and small but lets
-- the UI cheaply highlight or filter "essentials only" without scanning
-- the whole packing list.
create index if not exists trip_packing_items_essentials_idx
  on public.trip_packing_items (packing_list_id)
  where is_essential = true;
