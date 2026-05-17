-- SPEC-006b.4: track when a purchased grocery item has been added to
-- inventory, so the "Add purchased to inventory" action is idempotent.
--
-- The existing trip-completion "Reconcile" flow decrements inventory by
-- amount consumed and is unchanged. This is the separate "I bought new
-- stuff, add it to my camper inventory" path that runs at any time.
-- Without idempotency, clicking it twice would double-add.

alter table public.trip_grocery_items
  add column if not exists added_to_inventory_at timestamptz;
