BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  ws uuid := gen_random_uuid(); foreign_ws uuid := gen_random_uuid();
  draft uuid := gen_random_uuid(); second_draft uuid := gen_random_uuid();
  op public.workflow_operations; second_op public.workflow_operations; finished public.workflow_operations;
  avatar_op public.workflow_operations; snapshot uuid := gen_random_uuid(); image uuid := gen_random_uuid();
  capsule uuid := gen_random_uuid();
  item uuid := gen_random_uuid(); preview_draft uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.workspaces(id, name) VALUES (ws, 'operation_test_' || ws), (foreign_ws, 'operation_test_' || foreign_ws);
  INSERT INTO public.workflow_drafts(id, workspace_id, feature_kind)
    VALUES (draft, ws, 'preview'), (second_draft, ws, 'preview');
  op := public.start_workflow_operation(ws, 'preview_image', 'draft', draft, 1, repeat('a',64));
  second_op := public.start_workflow_operation(ws, 'preview_image', 'draft', second_draft, 1, repeat('b',64));
  op := public.claim_workflow_operation(ws, op.id, 1);
  INSERT INTO public.saved_look_snapshots(id, workspace_id, source_kind, source_revision, title, items, idempotency_key)
    VALUES (snapshot, ws, 'preview', 1, 'Synthetic preview', '[{}]', snapshot::text);
  avatar_op := public.start_workflow_operation(ws, 'saved_avatar', 'saved_look', snapshot, 1, repeat('c',64));
  INSERT INTO public.saved_look_media(workspace_id, saved_look_id, operation_id, preference_snapshot_hash)
    VALUES (ws, snapshot, avatar_op.id, repeat('d',64));
  BEGIN
    PERFORM public.claim_workflow_operation(ws, avatar_op.id, 1);
    RAISE EXCEPTION 'Cross-kind image quota was bypassed';
  EXCEPTION WHEN lock_not_available THEN NULL;
  END;
  BEGIN
    PERFORM public.claim_workflow_operation(ws, second_op.id, 1);
    RAISE EXCEPTION 'Concurrent image claim accepted';
  EXCEPTION WHEN lock_not_available THEN NULL;
  END;
  BEGIN
    PERFORM public.finish_workflow_operation(foreign_ws, op.id, 1, repeat('a',64), 'succeeded');
    RAISE EXCEPTION 'Foreign workspace accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.finish_workflow_operation(ws, op.id, 0, repeat('a',64), 'succeeded');
    RAISE EXCEPTION 'Stale attempt accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  BEGIN
    PERFORM public.finish_workflow_operation(ws, op.id, 1, repeat('f',64), 'succeeded');
    RAISE EXCEPTION 'Wrong fingerprint accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  BEGIN
    UPDATE public.workflow_operations SET lease_until = clock_timestamp() - interval '1 second'
      WHERE workspace_id = ws AND id = op.id;
    PERFORM public.finish_workflow_operation(ws, op.id, 1, repeat('a',64), 'succeeded');
    RAISE EXCEPTION 'Expired worker accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  finished := public.finish_workflow_operation(ws, op.id, 1, repeat('a',64), 'failed',
    jsonb_build_object('retryable', true, 'retryAfter', clock_timestamp() + interval '1 minute'), 'OPENAI_HTTP_429');
  IF finished.status <> 'failed' THEN RAISE EXCEPTION 'Failure transition missing'; END IF;
  BEGIN
    PERFORM public.retry_workflow_operation(ws, op.id);
    RAISE EXCEPTION 'Retry backoff ignored';
  EXCEPTION WHEN lock_not_available THEN NULL;
  END;
  UPDATE public.workflow_operations SET result_ref = jsonb_build_object('retryable', true, 'retryAfter', clock_timestamp() - interval '1 second')
    WHERE workspace_id = ws AND id = op.id;
  PERFORM public.retry_workflow_operation(ws, op.id);
  op := public.claim_workflow_operation(ws, op.id, 1);
  IF op.attempt_count <> 2 THEN RAISE EXCEPTION 'Retry fencing missing'; END IF;
  BEGIN
    PERFORM public.finish_workflow_operation(ws, op.id, 1, repeat('a',64), 'succeeded');
    RAISE EXCEPTION 'Earlier worker accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  UPDATE public.workflow_drafts SET status = 'discarded' WHERE id = draft AND workspace_id = ws;
  finished := public.finish_workflow_operation(ws, op.id, 2, repeat('a',64), 'succeeded');
  IF finished.status <> 'superseded' THEN RAISE EXCEPTION 'Discarded draft completion accepted'; END IF;
  avatar_op := public.claim_workflow_operation(ws, avatar_op.id, 1);
  PERFORM public.finish_workflow_operation(ws, avatar_op.id, 1, repeat('c',64), 'failed', NULL, 'PROVIDER_SCHEMA_INVALID');
  IF NOT EXISTS (SELECT 1 FROM public.saved_look_media WHERE workspace_id = ws AND operation_id = avatar_op.id AND status = 'failed') THEN
    RAISE EXCEPTION 'Avatar failure was not synchronized';
  END IF;
  BEGIN
    PERFORM public.retry_workflow_operation(ws, avatar_op.id);
    RAISE EXCEPTION 'Terminal schema failure was retried';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.retry_saved_look_media(ws, snapshot);
    RAISE EXCEPTION 'Saved-media retry bypassed terminal error classification';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  avatar_op := public.start_workflow_operation(ws, 'saved_avatar', 'saved_look', snapshot, 1, repeat('e',64));
  INSERT INTO public.saved_look_media(workspace_id, saved_look_id, operation_id, preference_snapshot_hash)
    VALUES (ws, snapshot, avatar_op.id, repeat('d',64));
  avatar_op := public.claim_workflow_operation(ws, avatar_op.id, 1);
  INSERT INTO public.assets(id, workspace_id, bucket, storage_path, mime_type, byte_size, source_type)
    VALUES (image, ws, 'previews', ws::text || '/' || image || '.png', 'image/png', 1, 'sample');
  BEGIN
    PERFORM public.complete_saved_avatar(ws, avatar_op.id, 1, repeat('e',64), image, repeat('f',64));
    RAISE EXCEPTION 'Unverified image accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.assets SET status = 'ready' WHERE workspace_id = ws AND id = image;
  finished := public.complete_saved_avatar(ws, avatar_op.id, 1, repeat('e',64), image, repeat('f',64));
  IF finished.status <> 'succeeded' OR NOT EXISTS (SELECT 1 FROM public.saved_look_media
    WHERE workspace_id = ws AND operation_id = avatar_op.id AND output_asset_id = image AND status = 'succeeded') THEN
    RAISE EXCEPTION 'Avatar and operation were not committed together';
  END IF;
  UPDATE public.workflow_drafts SET status = 'discarded' WHERE id = second_draft AND workspace_id = ws;
  finished := public.cancel_workflow_operation(ws, second_op.id);
  IF finished.status <> 'cancelled' THEN RAISE EXCEPTION 'Discarded draft cancellation failed'; END IF;
  PERFORM public.cancel_workflow_operation(ws, second_op.id);
  IF (SELECT count(*) FROM public.workflow_operation_events WHERE operation_id = second_op.id) <> 1 THEN
    RAISE EXCEPTION 'Duplicate cancellation event';
  END IF;
  IF EXISTS (SELECT 1 FROM public.workflow_operation_events WHERE workspace_id = ws
    GROUP BY operation_id HAVING max(sequence) <> count(*)) THEN RAISE EXCEPTION 'Event sequence has gaps'; END IF;
  IF has_function_privilege('anon', 'public.finish_workflow_operation(uuid,uuid,integer,text,text,jsonb,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.cancel_workflow_operation(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Direct RPC access allowed';
  END IF;
  INSERT INTO public.capsules(id, workspace_id, title) VALUES (capsule, ws, 'Synthetic deleted capsule');
  op := public.start_workflow_operation(ws, 'capsule_generation', 'capsule', capsule, 1, repeat('f',64));
  op := public.claim_workflow_operation(ws, op.id, 1);
  DELETE FROM public.capsules WHERE workspace_id = ws AND id = capsule;
  finished := public.finish_workflow_operation(ws, op.id, 1, repeat('f',64), 'succeeded');
  IF finished.status <> 'superseded' THEN RAISE EXCEPTION 'Deleted capsule completion accepted'; END IF;
  INSERT INTO public.wardrobe_items(id, workspace_id, name, category, inventory_status, source_type)
    VALUES (item, ws, 'Synthetic preview shirt', 'top', 'owned', 'sample');
  INSERT INTO public.workflow_drafts(id, workspace_id, feature_kind) VALUES (preview_draft, ws, 'preview');
  op := public.start_workflow_operation(ws, 'preview_image', 'draft', preview_draft, 1, repeat('b',64),
    jsonb_build_object('items', jsonb_build_array(jsonb_build_object('id', item, 'revision', 1)),
      'preferences', jsonb_build_object('revision', 0), 'renderFingerprint', repeat('f',64)));
  op := public.claim_workflow_operation(ws, op.id, 1);
  UPDATE public.wardrobe_items SET revision = 2 WHERE workspace_id = ws AND id = item;
  finished := public.complete_preview_operation(ws, op.id, 1, repeat('b',64), image, repeat('f',64));
  IF finished.status <> 'superseded' THEN RAISE EXCEPTION 'Edited wardrobe image completion accepted'; END IF;
END;
$$;
ROLLBACK;
