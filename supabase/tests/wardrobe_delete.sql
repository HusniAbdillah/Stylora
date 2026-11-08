BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  ws uuid := gen_random_uuid(); foreign_ws uuid := gen_random_uuid();
  item uuid := gen_random_uuid(); photo uuid := gen_random_uuid();
  look_id uuid := gen_random_uuid(); piece uuid := gen_random_uuid();
  option_id uuid := gen_random_uuid(); slot uuid := gen_random_uuid();
  capsule uuid := gen_random_uuid(); outfit uuid := gen_random_uuid();
  excluded_capsule uuid := gen_random_uuid();
  capsule_draft uuid := gen_random_uuid(); standalone_draft uuid := gen_random_uuid();
  intake_draft uuid := gen_random_uuid(); proposal uuid := gen_random_uuid();
  snapshot uuid := gen_random_uuid(); snapshot_items jsonb;
  row_state public.wardrobe_items;
BEGIN
  IF has_table_privilege('anon', 'public.wardrobe_items', 'DELETE')
    OR has_table_privilege('authenticated', 'public.wardrobe_items', 'DELETE')
    OR has_function_privilege('anon', 'public.wardrobe_item_command(uuid,uuid,integer,text,jsonb)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.wardrobe_item_command(uuid,uuid,integer,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Wardrobe deletion permits direct browser access';
  END IF;
  INSERT INTO public.workspaces(id, name) VALUES
    (ws, '__wardrobe_delete_' || ws), (foreign_ws, '__wardrobe_delete_' || foreign_ws);
  INSERT INTO public.assets(id, workspace_id, bucket, storage_path, mime_type, byte_size, status)
    VALUES (photo, ws, 'wardrobe', ws || '/' || photo || '/fixture.webp', 'image/webp', 1, 'ready');
  INSERT INTO public.wardrobe_items(id, workspace_id, name, category, asset_id)
    VALUES (item, ws, 'Deletion fixture shirt', 'top', photo);
  INSERT INTO public.looks(id, workspace_id, title) VALUES (look_id, ws, 'Deletion fixture look');
  INSERT INTO public.inspiration_pieces(id, workspace_id, look_id, name, category)
    VALUES (piece, ws, look_id, 'Deletion fixture inspiration shirt', 'top');
  INSERT INTO public.outfit_options(id, workspace_id, look_id, option_type, title, source_revision)
    VALUES (option_id, ws, look_id, 'from_wardrobe', 'Owned fixture option', 1);
  INSERT INTO public.outfit_option_items(id, workspace_id, look_id, option_id, slot_id, category, item_kind, wardrobe_item_id)
    VALUES (slot, ws, look_id, option_id, 'top', 'top', 'owned', item);
  INSERT INTO public.wardrobe_matches(workspace_id, look_id, piece_id, wardrobe_item_id, match_type, rationale, source_revision)
    VALUES (ws, look_id, piece, item, 'owned_match', 'Fixture correspondence', 1);
  INSERT INTO public.capsules(id, workspace_id, title, brief)
    VALUES (capsule, ws, 'Deletion fixture capsule',
      jsonb_build_object('includedItemIds', jsonb_build_array(item),
        'requiredItemIds', jsonb_build_array(item), 'excludedItemIds', '[]'::jsonb));
  INSERT INTO public.capsules(id, workspace_id, title, brief)
    VALUES (excluded_capsule, ws, 'Excluded-only capsule',
      jsonb_build_object('includedItemIds', '[]'::jsonb,
        'requiredItemIds', '[]'::jsonb, 'excludedItemIds', jsonb_build_array(item)));
  INSERT INTO public.capsule_items(workspace_id, capsule_id, wardrobe_item_id)
    VALUES (ws, capsule, item);
  INSERT INTO public.workflow_drafts(id, workspace_id, feature_kind, capsule_id, payload)
    VALUES (capsule_draft, ws, 'capsules', capsule,
      jsonb_build_object('brief', jsonb_build_object(
        'includedItemIds', jsonb_build_array(item),
        'requiredItemIds', jsonb_build_array(item),
        'excludedItemIds', '[]'::jsonb, 'notes', 'Keep these notes'),
        'capsuleRevision', 1));
  INSERT INTO public.workflow_drafts(id, workspace_id, feature_kind, payload)
    VALUES (standalone_draft, ws, 'capsules',
      jsonb_build_object('brief', jsonb_build_object(
        'includedItemIds', '[]'::jsonb, 'requiredItemIds', '[]'::jsonb,
        'excludedItemIds', jsonb_build_array(item), 'notes', 'Keep standalone notes')));
  INSERT INTO public.capsule_outfits(id, workspace_id, capsule_id, title, source_revision)
    VALUES (outfit, ws, capsule, 'Deletion fixture outfit', 1);
  INSERT INTO public.capsule_outfit_items(workspace_id, capsule_id, outfit_id, wardrobe_item_id, position)
    VALUES (ws, capsule, outfit, item, 0);
  snapshot_items := jsonb_build_array(jsonb_build_object(
    'source_reference', jsonb_build_object('kind', 'wardrobe', 'id', item),
    'media', jsonb_build_object('assetId', photo)));
  INSERT INTO public.saved_look_snapshots(id, workspace_id, look_id, option_id,
    source_revision, title, items, idempotency_key)
    VALUES (snapshot, ws, look_id, option_id, 1, 'Retained snapshot', snapshot_items, snapshot::text);
  INSERT INTO public.workflow_drafts(id, workspace_id, feature_kind, asset_id, payload)
    VALUES (intake_draft, ws, 'wardrobe', photo,
      jsonb_build_object('version', 'wardrobe-draft.v1', 'mode', 'manual',
        'proposals', jsonb_build_array(jsonb_build_object('id', proposal)),
        'saved', jsonb_build_object(proposal::text, item::text), 'metadata', '{}'::jsonb));
  BEGIN
    UPDATE public.outfit_option_items
    SET item_kind = 'missing', wardrobe_item_id = NULL,
      missing_brief = jsonb_build_object('description', 'Invalid live missing slot')
    WHERE workspace_id = ws AND id = slot;
    RAISE EXCEPTION 'A current from-wardrobe option accepted a missing slot';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'STYLORA_OWNED_ONLY_OPTION' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.outfit_options SET is_current = false WHERE workspace_id = ws AND id = option_id;
    UPDATE public.outfit_option_items SET item_kind = 'missing', wardrobe_item_id = NULL,
      missing_brief = jsonb_build_object('description', 'Invalid ready missing slot') WHERE workspace_id = ws AND id = slot;
    RAISE EXCEPTION 'A ready historical from-wardrobe option accepted a missing slot';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'STYLORA_OWNED_ONLY_OPTION' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.outfit_options SET status = 'unavailable' WHERE workspace_id = ws AND id = option_id;
    UPDATE public.outfit_option_items SET item_kind = 'missing', wardrobe_item_id = NULL,
      missing_brief = jsonb_build_object('description', 'Invalid current missing slot') WHERE workspace_id = ws AND id = slot;
    RAISE EXCEPTION 'A current unavailable from-wardrobe option accepted a missing slot';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'STYLORA_OWNED_ONLY_OPTION' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.wardrobe_item_command(foreign_ws, item, 1, 'delete');
    RAISE EXCEPTION 'Foreign workspace deletion accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.wardrobe_item_command(ws, item, 2, 'delete');
    RAISE EXCEPTION 'Stale item deletion accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  row_state := public.wardrobe_item_command(ws, item, 1, 'delete');
  IF row_state.id IS DISTINCT FROM item
    OR EXISTS (SELECT 1 FROM public.wardrobe_items WHERE workspace_id = ws AND id = item) THEN
    RAISE EXCEPTION 'Wardrobe item was not physically deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.wardrobe_matches WHERE workspace_id = ws AND wardrobe_item_id = item)
    OR NOT EXISTS (SELECT 1 FROM public.outfit_option_items WHERE workspace_id = ws AND id = slot
      AND wardrobe_item_id IS NULL AND item_kind = 'missing')
    OR NOT EXISTS (SELECT 1 FROM public.outfit_options WHERE workspace_id = ws AND id = option_id
      AND status = 'unavailable' AND NOT is_current AND revision = 2) THEN
    RAISE EXCEPTION 'Deleted wardrobe item still participates in live matching';
  END IF;
  IF EXISTS (SELECT 1 FROM public.capsule_items WHERE workspace_id = ws AND wardrobe_item_id = item)
    OR EXISTS (SELECT 1 FROM public.capsule_outfits WHERE workspace_id = ws AND capsule_id = capsule)
    OR NOT EXISTS (SELECT 1 FROM public.capsules WHERE workspace_id = ws AND id = capsule AND revision = 2
      AND brief -> 'includedItemIds' = '[]'::jsonb AND brief -> 'requiredItemIds' = '[]'::jsonb)
    OR NOT EXISTS (SELECT 1 FROM public.capsules WHERE workspace_id = ws AND id = excluded_capsule
      AND revision = 2 AND brief -> 'excludedItemIds' = '[]'::jsonb) THEN
    RAISE EXCEPTION 'Deleted wardrobe item still participates in a capsule';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.saved_look_snapshots WHERE workspace_id = ws AND id = snapshot
      AND items = snapshot_items)
    OR NOT EXISTS (SELECT 1 FROM public.assets WHERE workspace_id = ws AND id = photo AND status = 'ready') THEN
    RAISE EXCEPTION 'Deletion changed a saved snapshot or its image asset';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workflow_drafts WHERE workspace_id = ws AND id = capsule_draft
      AND revision = 2 AND payload -> 'brief' ->> 'notes' = 'Keep these notes'
      AND payload -> 'brief' -> 'includedItemIds' = '[]'::jsonb
      AND payload -> 'brief' -> 'requiredItemIds' = '[]'::jsonb
      AND payload ->> 'capsuleRevision' = '2')
    OR NOT EXISTS (SELECT 1 FROM public.workflow_drafts WHERE workspace_id = ws AND id = standalone_draft
      AND revision = 2 AND payload -> 'brief' ->> 'notes' = 'Keep standalone notes'
      AND payload -> 'brief' -> 'excludedItemIds' = '[]'::jsonb) THEN
    RAISE EXCEPTION 'Deletion left stale capsule draft inputs or erased their other inputs';
  END IF;
  BEGIN
    PERFORM public.wardrobe_draft_command(ws, intake_draft, 1, 'confirm',
      jsonb_build_object('proposalId', proposal));
    RAISE EXCEPTION 'A retry recreated an already deleted proposal';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.wardrobe_item_command(ws, item, 1, 'delete');
    RAISE EXCEPTION 'Absent row must return the not-found code used by idempotent HTTP DELETE';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
END;
$$;
ROLLBACK;
SELECT 'Wardrobe permanent deletion, workspace scope, stale revision, dependent invalidation and snapshot retention passed; fixtures rolled back' AS result;
