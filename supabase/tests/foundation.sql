BEGIN;

DO $$
DECLARE
  ws_a uuid := gen_random_uuid(); ws_b uuid := gen_random_uuid();
  look_a uuid := gen_random_uuid(); look_other uuid := gen_random_uuid();
  option_a uuid := gen_random_uuid(); option_b uuid := gen_random_uuid(); option_other uuid := gen_random_uuid();
  owned_a uuid := gen_random_uuid(); owned_b uuid := gen_random_uuid(); candidate uuid := gen_random_uuid();
  product uuid := gen_random_uuid(); asset_b uuid := gen_random_uuid();
  top_a uuid := gen_random_uuid(); top_b uuid := gen_random_uuid(); bottom_a uuid := gen_random_uuid(); other_top uuid := gen_random_uuid();
  capsule uuid := gen_random_uuid();
  selected_a public.look_selections; selected_b public.look_selections;
  saved public.saved_look_snapshots; saved_again public.saved_look_snapshots;
  operation public.workflow_operations; operation_again public.workflow_operations;
  choices jsonb; object_row record; checked_tables integer := 0;
BEGIN
  FOR object_row IN SELECT c.oid, c.relname, c.relrowsecurity FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
      AND c.relname = ANY (ARRAY['workspaces', 'assets', 'user_preferences', 'products', 'wardrobe_items', 'looks', 'inspiration_pieces',
        'look_reviews', 'wardrobe_matches', 'outfit_options', 'outfit_option_items', 'shopping_searches', 'shopping_results',
        'look_selections', 'look_selection_items', 'saved_look_snapshots', 'capsules', 'capsule_items', 'capsule_outfits',
        'capsule_outfit_items', 'workflow_drafts', 'workflow_operations', 'workflow_operation_events', 'saved_look_media', 'share_links'])
  LOOP
    checked_tables := checked_tables + 1;
    IF NOT object_row.relrowsecurity
      OR has_table_privilege('anon', object_row.oid, 'SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege('authenticated', object_row.oid, 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'Direct table access or missing RLS on %', object_row.relname;
    END IF;
  END LOOP;
  IF checked_tables <> 25 THEN RAISE EXCEPTION 'Expected 25 application tables, found %', checked_tables; END IF;
  IF has_function_privilege('anon', 'public.save_look_selection(uuid,uuid,uuid,integer,jsonb)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.save_look_snapshot(uuid,uuid,uuid,integer,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.save_look_snapshot(uuid,uuid,uuid,integer,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'RPC execution grants are invalid';
  END IF;

  INSERT INTO public.workspaces(id, name) VALUES (ws_a, '__foundation_smoke_a_' || ws_a::text), (ws_b, '__foundation_smoke_b_' || ws_b::text);
  INSERT INTO public.looks(id, workspace_id, title) VALUES (look_a, ws_a, 'Synthetic smoke look'), (look_other, ws_a, 'Synthetic other look');
  INSERT INTO public.assets(id, workspace_id, bucket, storage_path, mime_type, byte_size, status, source_type)
    VALUES (asset_b, ws_b, 'inspiration', ws_b::text || '/' || asset_b::text || '/fixture.png', 'image/png', 1, 'ready', 'sample');
  BEGIN
    UPDATE public.looks SET inspiration_asset_id = asset_b WHERE workspace_id = ws_a AND id = look_a;
    RAISE EXCEPTION 'Cross-workspace asset reference was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  INSERT INTO public.wardrobe_items(id, workspace_id, name, category, inventory_status, source_type)
    VALUES (owned_a, ws_a, 'Synthetic owned shirt A', 'top', 'owned', 'sample'),
      (owned_b, ws_a, 'Synthetic owned shirt B', 'top', 'owned', 'sample'),
      (candidate, ws_a, 'Synthetic saved candidate', 'top', 'saved_candidate', 'sample');
  IF EXISTS (SELECT 1 FROM public.active_owned_wardrobe WHERE workspace_id = ws_a AND id = candidate) THEN
    RAISE EXCEPTION 'Saved candidate appeared in owned inventory';
  END IF;
  INSERT INTO public.capsules(id, workspace_id, title) VALUES (capsule, ws_a, 'Synthetic smoke capsule');
  BEGIN
    INSERT INTO public.capsule_items(workspace_id, capsule_id, wardrobe_item_id) VALUES (ws_a, capsule, candidate);
    RAISE EXCEPTION 'Saved candidate was accepted in owned capsule membership';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.products(id, workspace_id, provider, provider_product_id, title, category, source_label, product_url, source_type)
    VALUES (product, ws_a, 'synthetic', product::text, 'Synthetic trousers, unknown price', 'bottom', 'Synthetic fixture', 'https://example.com/synthetic', 'sample');
  INSERT INTO public.outfit_options(id, workspace_id, look_id, option_type, title, source_revision, source_type)
    VALUES (option_a, ws_a, look_a, 'closest', 'Synthetic closest', 1, 'sample'),
      (option_b, ws_a, look_a, 'fresh_alternative', 'Synthetic fresh', 1, 'sample'),
      (option_other, ws_a, look_other, 'closest', 'Synthetic wrong parent', 1, 'sample');
  BEGIN
    UPDATE public.looks SET selected_option_id = option_other WHERE workspace_id = ws_a AND id = look_a;
    RAISE EXCEPTION 'Wrong-look option reference was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  INSERT INTO public.outfit_option_items(id, workspace_id, look_id, option_id, slot_id, category, item_kind, wardrobe_item_id, position, candidate_position)
    VALUES (top_a, ws_a, look_a, option_a, 'top', 'top', 'owned', owned_a, 0, 0),
      (top_b, ws_a, look_a, option_a, 'top', 'top', 'owned', owned_b, 0, 1),
      (other_top, ws_a, look_a, option_b, 'top', 'top', 'owned', owned_b, 0, 0);
  INSERT INTO public.outfit_option_items(id, workspace_id, look_id, option_id, slot_id, category, item_kind, product_id, position)
    VALUES (bottom_a, ws_a, look_a, option_a, 'bottom', 'bottom', 'product', product, 1);
  BEGIN
    INSERT INTO public.outfit_option_items(workspace_id, look_id, option_id, slot_id, category, item_kind, product_id, position, candidate_position)
      VALUES (ws_a, look_a, option_a, 'top', 'bottom', 'product', product, 0, 2);
    RAISE EXCEPTION 'Different-category candidate was accepted in the same slot';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  choices := jsonb_build_array(jsonb_build_object('slot_id', 'top', 'option_item_id', top_a), jsonb_build_object('slot_id', 'bottom', 'option_item_id', bottom_a));
  selected_a := public.save_look_selection(ws_a, look_a, option_a, 0, choices);
  selected_b := public.save_look_selection(ws_a, look_a, option_b, 0, jsonb_build_array(jsonb_build_object('slot_id', 'top', 'option_item_id', other_top)));
  choices := jsonb_build_array(jsonb_build_object('slot_id', 'top', 'option_item_id', top_b), jsonb_build_object('slot_id', 'bottom', 'option_item_id', bottom_a));
  selected_a := public.save_look_selection(ws_a, look_a, option_a, 1, choices);
  IF selected_a.revision <> 2 OR NOT EXISTS (SELECT 1 FROM public.look_selection_items
    WHERE workspace_id = ws_a AND selection_id = selected_b.id AND slot_id = 'top' AND option_item_id = other_top) THEN
    RAISE EXCEPTION 'Per-option selection restoration failed';
  END IF;
  BEGIN
    PERFORM public.save_look_selection(ws_a, look_a, option_a, 1, choices);
    RAISE EXCEPTION 'Stale selection revision was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  saved := public.save_look_snapshot(ws_a, look_a, option_a, 2, 'synthetic-smoke-save', 'Synthetic saved outfit');
  saved_again := public.save_look_snapshot(ws_a, look_a, option_a, 2, 'synthetic-smoke-save', 'Synthetic saved outfit');
  IF saved.id <> saved_again.id OR saved.spend_minor IS NOT NULL
    OR jsonb_array_length(saved.items) <> 2 OR saved.items #>> '{1,price_minor}' IS NOT NULL
    OR (saved.items #>> '{1,owned_at_save}')::boolean
    OR (SELECT count(*) FROM public.saved_look_snapshots WHERE workspace_id = ws_a) <> 1
    OR (SELECT count(*) FROM public.saved_look_media WHERE workspace_id = ws_a AND saved_look_id = saved.id) <> 1
    OR (SELECT count(*) FROM public.workflow_operations WHERE workspace_id = ws_a AND subject_id = saved.id AND kind = 'saved_avatar') <> 1 THEN
    RAISE EXCEPTION 'Atomic idempotent save or unknown-price preservation failed';
  END IF;
  BEGIN
    UPDATE public.saved_look_snapshots SET title = 'Changed snapshot' WHERE workspace_id = ws_a AND id = saved.id;
    RAISE EXCEPTION 'Immutable snapshot update was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  operation := public.start_workflow_operation(ws_a, 'inspiration_description', 'look', look_a, 1, repeat('a', 64));
  operation_again := public.start_workflow_operation(ws_a, 'inspiration_description', 'look', look_a, 1, repeat('a', 64));
  IF operation.id <> operation_again.id THEN RAISE EXCEPTION 'Operation start was not idempotent'; END IF;
  operation := public.claim_workflow_operation(ws_a, operation.id, 1);
  IF operation.status <> 'running' OR operation.attempt_count <> 1 THEN RAISE EXCEPTION 'Operation claim failed'; END IF;
  BEGIN
    PERFORM public.claim_workflow_operation(ws_a, operation.id, 1);
    RAISE EXCEPTION 'Concurrent live operation claim was accepted';
  EXCEPTION WHEN lock_not_available THEN NULL;
  END;
  UPDATE public.looks SET revision = 2 WHERE workspace_id = ws_a AND id = look_a;
  UPDATE public.workflow_operations SET lease_until = clock_timestamp() - interval '1 second'
    WHERE workspace_id = ws_a AND id = operation.id;
  operation := public.claim_workflow_operation(ws_a, operation.id, 1);
  IF operation.status <> 'superseded' OR operation.lease_until IS NOT NULL THEN RAISE EXCEPTION 'Stale operation was not superseded'; END IF;
  BEGIN
    PERFORM public.start_workflow_operation(ws_a, 'inspiration_description', 'look', look_a, 1, repeat('b', 64));
    RAISE EXCEPTION 'Stale operation input revision was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
END;
$$;

ROLLBACK;

SELECT 'foundation smoke checks passed; synthetic fixtures rolled back' AS result;
