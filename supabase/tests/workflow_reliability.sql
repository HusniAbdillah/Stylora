BEGIN;

DO $$
DECLARE obj record; signature text;
BEGIN
  FOR obj IN SELECT oid, relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace
    AND relname IN ('operation_result_checkpoints', 'workflow_provider_daily_budgets', 'workflow_worker_heartbeats') LOOP
    IF NOT obj.relrowsecurity OR has_table_privilege('anon', obj.oid, 'SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege('authenticated', obj.oid, 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'Reliability table exposed: %', obj.relname;
    END IF;
  END LOOP;
  FOREACH signature IN ARRAY ARRAY[
    'public.checkpoint_workflow_result(uuid,uuid,integer,text,jsonb,jsonb)',
    'public.reserve_workflow_provider_call(uuid,uuid,integer,text,integer,integer)',
    'public.release_workflow_provider_call(uuid,uuid,integer,text)',
    'public.claim_workflow_operation(uuid,uuid,integer,integer,integer,integer)',
    'public.defer_workflow_operation(uuid,uuid,integer,text,text,integer)',
    'public.record_workflow_worker_heartbeat(uuid,uuid,integer,text)'
  ] LOOP
    IF has_function_privilege('anon', signature, 'EXECUTE') OR has_function_privilege('authenticated', signature, 'EXECUTE')
      OR NOT has_function_privilege('service_role', signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'Reliability RPC grant invalid: %', signature;
    END IF;
  END LOOP;
  IF to_regprocedure('public.claim_workflow_operation(uuid,uuid,integer,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'Ambiguous legacy claim overload remains';
  END IF;
END; $$;

DO $$
DECLARE ws uuid := gen_random_uuid(); foreign_ws uuid := gen_random_uuid(); look_id uuid := gen_random_uuid();
  draft_id uuid := gen_random_uuid(); capsule_id uuid := gen_random_uuid(); ward_id uuid := gen_random_uuid();
  preview_id uuid := gen_random_uuid(); preview_other uuid := gen_random_uuid();
  first_op public.workflow_operations; second_op public.workflow_operations; third_op public.workflow_operations;
  fourth_op public.workflow_operations; image_op public.workflow_operations; other_image public.workflow_operations;
  calls bigint; image_calls bigint; day date := (clock_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
  INSERT INTO public.workspaces(id, name) VALUES (ws, '__reliability_quota_' || ws), (foreign_ws, '__reliability_foreign_' || foreign_ws);
  INSERT INTO public.looks(id, workspace_id, title) VALUES (look_id, ws, 'Synthetic quota look');
  INSERT INTO public.capsules(id, workspace_id, title) VALUES (capsule_id, ws, 'Synthetic quota capsule');
  INSERT INTO public.workflow_drafts(id, workspace_id, feature_kind, look_id) VALUES (draft_id, ws, 'inspiration', look_id);
  INSERT INTO public.workflow_drafts(id, workspace_id, feature_kind) VALUES (ward_id, ws, 'wardrobe'), (preview_id, ws, 'preview'), (preview_other, ws, 'preview');
  first_op := public.start_workflow_operation(ws, 'inspiration_description', 'look', look_id, 1, repeat('1',64));
  second_op := public.start_workflow_operation(ws, 'wardrobe_description', 'draft', ward_id, 1, repeat('2',64));
  third_op := public.start_workflow_operation(ws, 'capsule_generation', 'capsule', capsule_id, 1, repeat('3',64));
  fourth_op := public.start_workflow_operation(ws, 'inspiration_confidence', 'look', look_id, 1, repeat('4',64));
  first_op := public.claim_workflow_operation(ws, first_op.id, 1);
  second_op := public.claim_workflow_operation(ws, second_op.id, 1);
  third_op := public.claim_workflow_operation(ws, third_op.id, 1);
  BEGIN
    PERFORM public.claim_workflow_operation(ws, fourth_op.id, 1);
    RAISE EXCEPTION 'Fourth cross-kind text claim accepted';
  EXCEPTION WHEN lock_not_available THEN NULL; END;
  IF (SELECT attempt_count FROM public.workflow_operations WHERE workspace_id = ws AND id = fourth_op.id) <> 0 THEN
    RAISE EXCEPTION 'Busy claim consumed attempt';
  END IF;
  PERFORM public.reserve_create_provider_call(ws, first_op.id, 1);
  PERFORM public.reserve_wardrobe_provider_call(ws, second_op.id, 1);
  PERFORM public.reserve_workflow_provider_call(ws, third_op.id, 1, third_op.input_fingerprint);
  BEGIN
    PERFORM public.reserve_workflow_provider_call(ws, third_op.id, 1, third_op.input_fingerprint);
    RAISE EXCEPTION 'Fourth cross-kind text HTTP request accepted';
  EXCEPTION WHEN lock_not_available THEN NULL; END;
  BEGIN
    PERFORM public.reserve_workflow_provider_call(foreign_ws, third_op.id, 1, third_op.input_fingerprint);
    RAISE EXCEPTION 'Foreign workspace reservation accepted';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    PERFORM public.reserve_workflow_provider_call(ws, third_op.id, 2, third_op.input_fingerprint);
    RAISE EXCEPTION 'Stale reservation accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  SELECT b.text_calls, b.image_calls INTO calls, image_calls FROM public.workflow_provider_daily_budgets b
    WHERE workspace_id = ws AND budget_date = day;
  IF calls <> 3 OR image_calls <> 0 THEN RAISE EXCEPTION 'Rejected reservation charged daily budget'; END IF;
  image_op := public.start_workflow_operation(ws, 'preview_image', 'draft', preview_id, 1, repeat('5',64));
  other_image := public.start_workflow_operation(ws, 'preview_image', 'draft', preview_other, 1, repeat('6',64));
  image_op := public.claim_workflow_operation(ws, image_op.id, 1);
  PERFORM public.reserve_workflow_provider_call(ws, image_op.id, 1, image_op.input_fingerprint);
  BEGIN
    PERFORM public.claim_workflow_operation(ws, other_image.id, 1);
    RAISE EXCEPTION 'Second image claim accepted';
  EXCEPTION WHEN lock_not_available THEN NULL; END;
  IF (SELECT b.image_calls FROM public.workflow_provider_daily_budgets b WHERE workspace_id = ws AND budget_date = day) <> 1 THEN
    RAISE EXCEPTION 'Image budget not independent of text';
  END IF;
  PERFORM public.release_create_provider_call(ws, first_op.id, 1);
  PERFORM public.release_workflow_provider_call(ws, third_op.id, 0, third_op.input_fingerprint);
  IF (SELECT provider_inflight FROM public.workflow_operations WHERE workspace_id = ws AND id = third_op.id) <> 1 THEN
    RAISE EXCEPTION 'Stale release changed live reservation';
  END IF;
  PERFORM public.cancel_workflow_operation(ws, first_op.id);
  PERFORM public.finish_workflow_operation(ws, first_op.id, 1, first_op.input_fingerprint, 'failed', '{"retryable":true}', 'PROVIDER_NETWORK_ERROR');
  BEGIN
    PERFORM public.claim_workflow_operation(ws, fourth_op.id, 1, 120, 3, 20);
    RAISE EXCEPTION 'Daily cap ignored before claim';
  EXCEPTION WHEN lock_not_available THEN NULL; END;
  fourth_op := public.claim_workflow_operation(ws, fourth_op.id, 1, 120, 4, 20);
  PERFORM public.reserve_workflow_provider_call(ws, fourth_op.id, 1, fourth_op.input_fingerprint, 4, 20);
  PERFORM public.release_workflow_provider_call(ws, fourth_op.id, 1, fourth_op.input_fingerprint);
  BEGIN
    PERFORM public.reserve_workflow_provider_call(ws, fourth_op.id, 1, fourth_op.input_fingerprint, 4, 20);
    RAISE EXCEPTION 'Daily cap ignored at HTTP boundary';
  EXCEPTION WHEN program_limit_exceeded THEN NULL; END;
  INSERT INTO public.workflow_provider_daily_budgets(workspace_id, budget_date, text_calls, image_calls)
    VALUES (ws, day - 1, 500, 50);
  IF (SELECT text_calls FROM public.workflow_provider_daily_budgets WHERE workspace_id = ws AND budget_date = day) <> 4 THEN
    RAISE EXCEPTION 'Past UTC day affected current ledger';
  END IF;
END; $$;

DO $$
DECLARE ws uuid := gen_random_uuid(); foreign_ws uuid := gen_random_uuid(); look_id uuid := gen_random_uuid(); draft_id uuid := gen_random_uuid();
  op public.workflow_operations; checkpoint public.operation_result_checkpoints; replay public.operation_result_checkpoints;
  published public.workflow_operations; result jsonb := '{"pieces":[]}'::jsonb; metadata jsonb := '{"requestId":"req_synthetic"}'::jsonb; n integer;
BEGIN
  INSERT INTO public.workspaces(id, name) VALUES (ws, '__reliability_checkpoint_' || ws), (foreign_ws, '__reliability_checkpoint_foreign_' || foreign_ws);
  INSERT INTO public.looks(id, workspace_id, title) VALUES (look_id, ws, 'Synthetic checkpoint look');
  INSERT INTO public.workflow_drafts(id, workspace_id, feature_kind, look_id) VALUES (draft_id, ws, 'inspiration', look_id);
  op := public.start_workflow_operation(ws, 'inspiration_description', 'look', look_id, 1, repeat('a',64),
    jsonb_build_object('lookId',look_id,'lookRevision',1,'draftId',draft_id), 'fixture-prompt', 'fixture-schema', 'fixture-model');
  op := public.claim_workflow_operation(ws, op.id, 1);
  FOR n IN 1..3 LOOP
    PERFORM public.reserve_create_provider_call(ws, op.id, op.attempt_count);
    PERFORM public.release_create_provider_call(ws, op.id, op.attempt_count);
  END LOOP;
  checkpoint := public.checkpoint_workflow_result(ws, op.id, 1, op.input_fingerprint, result, metadata);
  replay := public.checkpoint_workflow_result(ws, op.id, 1, op.input_fingerprint, result, metadata);
  IF checkpoint IS DISTINCT FROM replay OR checkpoint.created_attempt <> 1 OR checkpoint.prompt_version <> 'fixture-prompt' THEN
    RAISE EXCEPTION 'Checkpoint replay or versions changed';
  END IF;
  BEGIN
    PERFORM public.checkpoint_workflow_result(foreign_ws, op.id, 1, op.input_fingerprint, result, metadata);
    RAISE EXCEPTION 'Foreign checkpoint accepted';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    PERFORM public.checkpoint_workflow_result(ws, op.id, 0, op.input_fingerprint, result, metadata);
    RAISE EXCEPTION 'Stale checkpoint accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.checkpoint_workflow_result(ws, op.id, 1, op.input_fingerprint, '{"pieces":[{}]}', metadata);
    RAISE EXCEPTION 'Checkpoint replacement accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.finish_create_operation(ws, op.id, 1, result, '{}');
    RAISE EXCEPTION 'Checkpoint metadata mismatch published';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    UPDATE public.operation_result_checkpoints SET result = '{}' WHERE workspace_id = ws AND operation_id = op.id;
    RAISE EXCEPTION 'Checkpoint update accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  op := public.finish_workflow_operation(ws, op.id, 1, op.input_fingerprint, 'failed', '{"retryable":true}', 'CHECKPOINT_COMMIT_PENDING');
  IF op.result_ref->>'checkpointed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Checkpoint recovery marker missing'; END IF;
  op := public.control_create_operation(ws, op.id, 'retry');
  op := public.claim_workflow_operation(ws, op.id, 1);
  IF op.attempt_count <> 2 OR op.provider_call_count <> 3 THEN RAISE EXCEPTION 'Commit-only claim reset call count or attempt'; END IF;
  published := public.finish_create_operation(ws, op.id, 2, result, metadata);
  IF published.status <> 'succeeded' OR published.provider_call_count <> 3 OR published.provider_inflight <> 0 THEN
    RAISE EXCEPTION 'Validated checkpoint did not publish without another paid request';
  END IF;
  op := public.start_workflow_operation(ws, 'inspiration_description', 'look', look_id, 1, repeat('b',64),
    jsonb_build_object('lookId',look_id,'lookRevision',1,'draftId',draft_id), 'fixture-prompt', 'fixture-schema', 'fixture-model');
  op := public.claim_workflow_operation(ws, op.id, 1);
  PERFORM public.checkpoint_workflow_result(ws, op.id, 1, op.input_fingerprint, result, metadata);
  UPDATE public.workflow_drafts SET status = 'discarded' WHERE workspace_id = ws AND id = draft_id;
  published := public.finish_create_operation(ws, op.id, 1, result, metadata);
  IF published.status <> 'superseded' THEN RAISE EXCEPTION 'Discarded draft accepted paid completion'; END IF;
END; $$;

DO $$
DECLARE ws uuid := gen_random_uuid(); draft uuid := gen_random_uuid(); asset uuid := gen_random_uuid();
  foreign_ws uuid := gen_random_uuid(); foreign_asset uuid := gen_random_uuid(); worker uuid := gen_random_uuid();
  op public.workflow_operations; heartbeat public.workflow_worker_heartbeats; due_at timestamptz;
BEGIN
  INSERT INTO public.workspaces(id, name) VALUES (ws, '__reliability_recovery_' || ws), (foreign_ws, '__reliability_image_foreign_' || foreign_ws);
  INSERT INTO public.workflow_drafts(id, workspace_id, feature_kind) VALUES (draft, ws, 'preview');
  INSERT INTO public.assets(id, workspace_id, bucket, storage_path, mime_type, byte_size, source_type)
    VALUES (asset, ws, 'previews', ws::text || '/' || asset::text || '/synthetic.png', 'image/png', 1, 'sample'),
      (foreign_asset, foreign_ws, 'previews', foreign_ws::text || '/' || foreign_asset::text || '/synthetic.png', 'image/png', 1, 'sample');
  op := public.start_workflow_operation(ws, 'preview_image', 'draft', draft, 1, repeat('c',64), '{}', 'fixture-prompt', 'fixture-schema', 'fixture-model');
  op := public.claim_workflow_operation(ws, op.id, 1);
  BEGIN
    PERFORM public.checkpoint_workflow_result(ws, op.id, 1, op.input_fingerprint,
      jsonb_build_object('assetId',foreign_asset,'renderFingerprint',repeat('d',64)));
    RAISE EXCEPTION 'Foreign image checkpoint accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.checkpoint_workflow_result(ws, op.id, 1, op.input_fingerprint,
      jsonb_build_object('assetId',asset,'renderFingerprint',repeat('d',64),'b64_json','raw image'));
    RAISE EXCEPTION 'Raw image checkpoint accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM public.checkpoint_workflow_result(ws, op.id, 1, op.input_fingerprint,
    jsonb_build_object('assetId',asset,'renderFingerprint',repeat('d',64)));
  BEGIN
    PERFORM public.defer_workflow_operation(ws, op.id, 1, op.input_fingerprint, 'OPENAI_INVALID_OUTPUT');
    RAISE EXCEPTION 'Deterministic failure automatically retried';
  EXCEPTION WHEN check_violation THEN NULL; END;
  op := public.defer_workflow_operation(ws, op.id, 1, op.input_fingerprint, 'CHECKPOINT_COMMIT_PENDING', 30);
  due_at := op.next_attempt_at;
  IF op.status <> 'queued' OR op.attempt_count <> 1 OR due_at < clock_timestamp() + interval '29 seconds' THEN
    RAISE EXCEPTION 'Durable delay or fencing attempt missing';
  END IF;
  op := public.defer_workflow_operation(ws, op.id, 1, op.input_fingerprint, 'CHECKPOINT_COMMIT_PENDING', 60);
  IF op.next_attempt_at IS DISTINCT FROM due_at THEN RAISE EXCEPTION 'Duplicate defer changed deadline'; END IF;
  BEGIN
    PERFORM public.claim_workflow_operation(ws, op.id, 1);
    RAISE EXCEPTION 'Claim ignored durable backoff';
  EXCEPTION WHEN lock_not_available THEN NULL; END;
  UPDATE public.workflow_operations SET next_attempt_at = clock_timestamp() - interval '1 second' WHERE workspace_id = ws AND id = op.id;
  op := public.claim_workflow_operation(ws, op.id, 1);
  IF op.attempt_count <> 2 THEN RAISE EXCEPTION 'Attempt fencing was reused'; END IF;
  BEGIN
    PERFORM public.checkpoint_workflow_result(ws, op.id, 1, op.input_fingerprint, '{}');
    RAISE EXCEPTION 'Old worker changed checkpoint after re-claim';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.checkpoint_workflow_result(ws, op.id, 2, op.input_fingerprint, jsonb_build_object('x',repeat('x',524288)));
    RAISE EXCEPTION 'Oversize checkpoint accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  op := public.defer_workflow_operation(ws, op.id, 2, op.input_fingerprint, 'OPENAI_HTTP_429', 0);
  UPDATE public.workflow_operations SET next_attempt_at = clock_timestamp() - interval '1 second' WHERE workspace_id = ws AND id = op.id;
  op := public.claim_workflow_operation(ws, op.id, 1);
  BEGIN
    PERFORM public.defer_workflow_operation(ws, op.id, 3, op.input_fingerprint, 'OPENAI_HTTP_503');
    RAISE EXCEPTION 'Fourth automatic attempt allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  heartbeat := public.record_workflow_worker_heartbeat(ws, worker, 2, 'fixture-worker.v1');
  heartbeat := public.record_workflow_worker_heartbeat(ws, worker, 0, 'fixture-worker.v2');
  IF heartbeat.active_jobs <> 0 OR heartbeat.version <> 'fixture-worker.v2' OR heartbeat.last_seen_at < clock_timestamp() - interval '1 second'
    OR (SELECT count(*) FROM public.workflow_worker_heartbeats WHERE workspace_id = ws AND worker_id = worker) <> 1 THEN
    RAISE EXCEPTION 'Worker heartbeat not scoped and idempotent';
  END IF;
  DELETE FROM public.workflow_operations WHERE workspace_id = ws AND id = op.id;
  IF EXISTS (SELECT 1 FROM public.operation_result_checkpoints WHERE workspace_id = ws AND operation_id = op.id) THEN
    RAISE EXCEPTION 'Operation checkpoint cleanup did not cascade';
  END IF;
END; $$;

ROLLBACK;
SELECT 'workflow reliability policies, shared quotas, immutable checkpoints, draft fencing and durable recovery passed; fixtures rolled back' AS result;
