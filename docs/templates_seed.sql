-- Camp Planner: seed two production-ready templates
-- ============================================================
-- Run this in Supabase Studio's SQL Editor as the project owner.
-- It uses your profile (looked up by email below) so the templates
-- show up in your account as if you created them via the UI.
--
-- The two templates created:
--   1. "Weekend Tent Camping" (packing) — 45 items, summer/fall, tent type
--   2. "Pre-trip Prep" (task template) — 15 tasks, week-of-trip prep
-- ============================================================

DO $seed$
DECLARE
  v_user_id uuid;
  v_packing_template_id uuid;
  v_task_template_id uuid;
BEGIN
  -- ----------------------------------------------------------
  -- Resolve user
  -- ----------------------------------------------------------
  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE lower(email) = lower('you@example.com');

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No profile found for you@example.com — replace with your account email, sign in once first, then re-run.';
  END IF;

  -- ----------------------------------------------------------
  -- PACKING TEMPLATE — "Weekend Tent Camping"
  -- ----------------------------------------------------------
  INSERT INTO public.packing_templates (name, description, seasons, trip_types, created_by)
  VALUES (
    'Weekend Tent Camping',
    'Two-person tent setup for a 2-3 night trip in mild weather. Covers shelter, cooking, comfort, safety, and personal gear.',
    ARRAY['spring', 'summer', 'fall'],
    ARRAY['tent'],
    v_user_id
  )
  RETURNING id INTO v_packing_template_id;

  INSERT INTO public.packing_template_items
    (template_id, name, category, is_essential, quantity, notes, sort_order)
  VALUES
    -- SHELTER
    (v_packing_template_id, 'Tent (4-person)',           'shelter',  true,  1, 'Includes rainfly, stakes, guy lines', 0),
    (v_packing_template_id, 'Tent footprint',            'shelter',  false, 1, 'Protects tent floor',                 1),
    (v_packing_template_id, 'Sleeping bags',             'shelter',  true,  2, '30°F rated for shoulder seasons',     2),
    (v_packing_template_id, 'Sleeping pads',             'shelter',  true,  2, null,                                  3),
    (v_packing_template_id, 'Pillows',                   'shelter',  false, 2, null,                                  4),
    (v_packing_template_id, 'Tarp (extra)',              'shelter',  false, 1, 'For rain coverage over picnic area',  5),
    (v_packing_template_id, 'Paracord',                  'shelter',  false, 1, '50ft for tarp + clothesline',         6),

    -- COOKING
    (v_packing_template_id, 'Camp stove (2-burner)',     'cooking',  true,  1, null,                                  7),
    (v_packing_template_id, 'Propane canisters',         'cooking',  true,  2, '1lb canisters',                       8),
    (v_packing_template_id, 'Lighter + matches',         'cooking',  true,  1, 'Waterproof matches as backup',        9),
    (v_packing_template_id, 'Cooler with ice',           'cooking',  true,  1, 'Pre-chill 24h before trip',           10),
    (v_packing_template_id, 'Cookware set',              'cooking',  true,  1, 'Pot, pan, lid',                       11),
    (v_packing_template_id, 'Plates + bowls',            'cooking',  true,  2, null,                                  12),
    (v_packing_template_id, 'Utensils',                  'cooking',  true,  2, 'Fork, knife, spoon per person',       13),
    (v_packing_template_id, 'Camp mugs',                 'cooking',  false, 2, null,                                  14),
    (v_packing_template_id, 'Coffee maker',              'cooking',  false, 1, 'Pour-over or French press',           15),
    (v_packing_template_id, 'Water jugs (5gal)',         'cooking',  true,  2, null,                                  16),
    (v_packing_template_id, 'Dish soap + sponge',        'cooking',  true,  1, null,                                  17),
    (v_packing_template_id, 'Cutting board + knife',     'cooking',  true,  1, null,                                  18),
    (v_packing_template_id, 'Aluminum foil',             'cooking',  false, 1, null,                                  19),
    (v_packing_template_id, 'Trash bags',                'cooking',  true,  1, '13-gal kitchen + heavy duty',         20),

    -- SAFETY
    (v_packing_template_id, 'First aid kit',             'safety',   true,  1, null,                                  21),
    (v_packing_template_id, 'Fire extinguisher',         'safety',   true,  1, 'Small ABC for camp',                  22),
    (v_packing_template_id, 'Headlamps',                 'safety',   true,  2, 'Fresh batteries',                     23),
    (v_packing_template_id, 'Lantern',                   'safety',   false, 1, 'For the picnic table',                24),
    (v_packing_template_id, 'Bug spray (DEET)',          'safety',   true,  1, null,                                  25),
    (v_packing_template_id, 'Sunscreen (SPF 30+)',       'safety',   true,  1, null,                                  26),
    (v_packing_template_id, 'Whistle',                   'safety',   false, 2, null,                                  27),

    -- CLOTHING
    (v_packing_template_id, 'Layers (per person)',       'clothing', true,  2, 'Base, mid, shell',                    28),
    (v_packing_template_id, 'Hat (sun + warm)',          'clothing', true,  2, 'One each',                            29),
    (v_packing_template_id, 'Rain jacket',               'clothing', true,  2, null,                                  30),
    (v_packing_template_id, 'Hiking shoes',              'clothing', true,  2, null,                                  31),
    (v_packing_template_id, 'Camp shoes/sandals',        'clothing', false, 2, null,                                  32),
    (v_packing_template_id, 'Wool socks',                'clothing', true,  4, '2 pairs per person',                  33),

    -- PERSONAL
    (v_packing_template_id, 'Toiletries kit',            'personal', true,  2, 'Toothbrush, toothpaste, etc',         34),
    (v_packing_template_id, 'Towels (quick-dry)',        'personal', true,  2, null,                                  35),
    (v_packing_template_id, 'Hand sanitizer',            'personal', true,  1, null,                                  36),
    (v_packing_template_id, 'Toilet paper',              'personal', true,  1, 'Double-bag in zip-loc',               37),
    (v_packing_template_id, 'Medications',               'personal', true,  1, 'Per-person, 2 extra days worth',      38),
    (v_packing_template_id, 'Sunglasses',                'personal', false, 2, null,                                  39),

    -- TOOLS
    (v_packing_template_id, 'Multi-tool',                'tools',    true,  1, null,                                  40),
    (v_packing_template_id, 'Duct tape',                 'tools',    false, 1, null,                                  41),
    (v_packing_template_id, 'Folding saw / hatchet',     'tools',    false, 1, 'If processing firewood',              42),
    (v_packing_template_id, 'Camp chairs',               'tools',    true,  2, null,                                  43),
    (v_packing_template_id, 'Folding table',             'tools',    false, 1, 'If site has no picnic table',         44);

  -- ----------------------------------------------------------
  -- TASK TEMPLATE — "Pre-trip Prep"
  -- ----------------------------------------------------------
  INSERT INTO public.task_templates (name, description, created_by)
  VALUES (
    'Pre-trip Prep',
    'Week-of-trip preparation checklist. Stagger from 7 days out to day-of so nothing gets crammed in at the last minute.',
    v_user_id
  )
  RETURNING id INTO v_task_template_id;

  INSERT INTO public.task_template_items (template_id, title, description, sort_order)
  VALUES
    (v_task_template_id, 'Check weather forecast',         'Check 7-day forecast for the destination; adjust packing list if rain or cold expected.', 0),
    (v_task_template_id, 'Confirm campsite reservation',   'Verify check-in time, site number, and any access codes.',                                1),
    (v_task_template_id, 'Plan meals for the trip',        'Use the meal planner; aim for 3 mains + snacks per day.',                                 2),
    (v_task_template_id, 'Generate grocery list',          'From the meal plan; subtract camper inventory.',                                          3),
    (v_task_template_id, 'Charge all batteries',           'Headlamps, lantern, phone backups, camera, walkie-talkies.',                            4),
    (v_task_template_id, 'Test camp stove',                'Confirm propane connection and igniter; replace canister if low.',                        5),
    (v_task_template_id, 'Check vehicle: tires + fluids',  'Tire pressure including spare; oil + coolant if road trip is long.',                      6),
    (v_task_template_id, 'Refill propane canisters',       'Pick up 1-2 spares if running low.',                                                      7),
    (v_task_template_id, 'Pack non-perishables',           'Cooking gear, dry goods, shelter, clothing.',                                             8),
    (v_task_template_id, 'Pre-chill the cooler',           '24 hours before departure; speeds ice retention significantly.',                          9),
    (v_task_template_id, 'Grocery run',                    'Pick up groceries 1 day before departure (fresh produce + perishables).',                 10),
    (v_task_template_id, 'Pack perishables + ice',         'Day-of, load cooler with ice and perishables together.',                                  11),
    (v_task_template_id, 'Load vehicle',                   'Heavy items low and centered; keep first-aid + maps within reach.',                       12),
    (v_task_template_id, 'Final walk-through',             'Lights off, doors locked, mail held, thermostat set.',                                    13),
    (v_task_template_id, 'Send share link to guests',      'If anyone is joining who is not a planner, send them the trip share link.',               14);

  RAISE NOTICE 'Created packing template % and task template %',
    v_packing_template_id, v_task_template_id;

END $seed$;
