BEGIN;
SET LOCAL ROLE service_role;

DO $$
DECLARE ws uuid := gen_random_uuid(); foreign_ws uuid := gen_random_uuid(); draft uuid := gen_random_uuid();
  previous_draft uuid := gen_random_uuid(); foreign_draft uuid := gen_random_uuid(); asset uuid := gen_random_uuid();
  foreign_asset uuid := gen_random_uuid(); item uuid := gen_random_uuid(); snapshot uuid := gen_random_uuid(); fingerprint text := repeat('a',64);
  previous public.workflow_operations; op public.workflow_operations; second_op public.workflow_operations;
  done public.workflow_operations; scenario text; n integer := 4; input jsonb;
BEGIN
  INSERT INTO public.workspaces(id,name) VALUES(ws,'__cached_claim_'||ws),(foreign_ws,'__cached_claim_foreign_'||foreign_ws);
  INSERT INTO public.workflow_drafts(id,workspace_id,feature_kind)
    VALUES(draft,ws,'preview'),(previous_draft,ws,'preview'),(foreign_draft,foreign_ws,'preview');
  INSERT INTO public.wardrobe_items(id,workspace_id,name,category,source_type)
    VALUES(item,ws,'Synthetic cache claim top','top','sample');
  INSERT INTO public.assets(id,workspace_id,bucket,storage_path,mime_type,byte_size,status,source_type)
    VALUES(asset,ws,'previews',ws::text||'/'||asset::text||'/fixture.png','image/png',1,'ready','sample'),
      (foreign_asset,foreign_ws,'previews',foreign_ws::text||'/'||foreign_asset::text||'/fixture.png','image/png',1,'ready','sample');
  previous := public.start_workflow_operation(ws,'preview_image','draft',previous_draft,1,repeat('1',64));
  UPDATE public.workflow_operations SET status='succeeded',completed_at=clock_timestamp(),
    result_ref=jsonb_build_object('assetId',asset,'renderFingerprint',fingerprint)
    WHERE workspace_id=ws AND id=previous.id;
  previous := public.start_workflow_operation(foreign_ws,'preview_image','draft',foreign_draft,1,repeat('2',64));
  UPDATE public.workflow_operations SET status='succeeded',completed_at=clock_timestamp(),
    result_ref=jsonb_build_object('assetId',foreign_asset,'renderFingerprint',fingerprint)
    WHERE workspace_id=foreign_ws AND id=previous.id;
  INSERT INTO public.workflow_provider_daily_budgets(workspace_id,budget_date,image_calls)
    VALUES(ws,(clock_timestamp() AT TIME ZONE 'UTC')::date,3);
  input := jsonb_build_object('reuse',true,'renderFingerprint',fingerprint,
    'items',jsonb_build_array(jsonb_build_object('id',item,'revision',1)),'preferences',jsonb_build_object('revision',0));
  op := public.start_workflow_operation(ws,'preview_image','draft',draft,1,repeat('3',64),input);
  op := public.claim_workflow_operation(ws,op.id,1,120,150,3);
  IF op.status <> 'running' OR op.provider_call_count <> 0 OR op.attempt_count <> 1 THEN
    RAISE EXCEPTION 'Ready cache could not claim without spending a provider request';
  END IF;
  second_op := public.start_workflow_operation(ws,'preview_image','draft',draft,1,repeat('4',64),input);
  BEGIN
    PERFORM public.claim_workflow_operation(ws,second_op.id,1,120,150,3);
    RAISE EXCEPTION 'Cached claim bypassed live image capacity';
  EXCEPTION WHEN lock_not_available THEN NULL; END;
  BEGIN
    PERFORM public.reserve_workflow_provider_call(ws,op.id,op.attempt_count,op.input_fingerprint,150,3);
    RAISE EXCEPTION 'Cached claim bypassed actual HTTP budget';
  EXCEPTION WHEN program_limit_exceeded THEN NULL; END;
  done := public.complete_preview_operation(ws,op.id,1,op.input_fingerprint,asset,fingerprint);
  IF done.status <> 'succeeded' OR done.provider_call_count <> 0 THEN RAISE EXCEPTION 'Cache-only publication failed'; END IF;
  UPDATE public.workflow_operations SET provider_call_count=3 WHERE workspace_id=ws AND id=second_op.id;
  second_op := public.claim_workflow_operation(ws,second_op.id,1,120,150,3);
  IF second_op.status <> 'running' OR second_op.provider_call_count <> 3 THEN
    RAISE EXCEPTION 'Cache-only operation budget bypass failed';
  END IF;
  PERFORM public.complete_preview_operation(ws,second_op.id,1,second_op.input_fingerprint,asset,fingerprint);
  FOREACH scenario IN ARRAY ARRAY['reuse_false','foreign_operation','foreign_asset','missing_asset','pending_asset','malformed_asset','fingerprint_mismatch'] LOOP
    n := n+1;
    op := public.start_workflow_operation(ws,'preview_image','draft',draft,1,lpad(to_hex(n),64,'0'),
      input || CASE WHEN scenario='reuse_false' THEN '{"reuse":false}'::jsonb
        WHEN scenario='fingerprint_mismatch' THEN jsonb_build_object('renderFingerprint',repeat('b',64)) ELSE '{}'::jsonb END);
    BEGIN
      IF scenario='foreign_operation' THEN
        UPDATE public.workflow_operations SET status='failed' WHERE workspace_id=ws AND status='succeeded';
      ELSIF scenario IN ('foreign_asset','missing_asset','malformed_asset') THEN
        UPDATE public.workflow_operations SET result_ref=jsonb_build_object('renderFingerprint',fingerprint,
          'assetId',CASE WHEN scenario='foreign_asset' THEN foreign_asset::text
            WHEN scenario='missing_asset' THEN gen_random_uuid()::text ELSE 'not-a-uuid' END)
          WHERE workspace_id=ws AND status='succeeded';
      ELSIF scenario='pending_asset' THEN
        UPDATE public.assets SET status='pending' WHERE workspace_id=ws AND id=asset;
      END IF;
      PERFORM public.claim_workflow_operation(ws,op.id,1,120,150,3);
      RAISE EXCEPTION 'Unsafe cached claim admitted: %',scenario;
    EXCEPTION WHEN lock_not_available THEN NULL; END;
    IF (SELECT attempt_count FROM public.workflow_operations WHERE workspace_id=ws AND id=op.id) <> 0 THEN
      RAISE EXCEPTION 'Denied cached claim consumed attempt: %',scenario;
    END IF;
  END LOOP;
  n := n+1;
  op := public.start_workflow_operation(ws,'preview_image','draft',draft,1,lpad(to_hex(n),64,'0'),input - 'reuse');
  op := public.claim_workflow_operation(ws,op.id,1,120,150,3);
  IF op.status <> 'running' OR op.provider_call_count <> 0 THEN RAISE EXCEPTION 'Legacy reuse default rejected'; END IF;
  PERFORM public.complete_preview_operation(ws,op.id,1,op.input_fingerprint,asset,fingerprint);
  INSERT INTO public.saved_look_snapshots(id,workspace_id,source_kind,source_revision,title,items,idempotency_key)
    VALUES(snapshot,ws,'preview',1,'Synthetic saved cache','[{}]',snapshot::text);
  previous := public.start_workflow_operation(ws,'saved_avatar','saved_look',snapshot,1,repeat('e',64));
  UPDATE public.workflow_operations SET status='succeeded',completed_at=clock_timestamp(),
    result_ref=jsonb_build_object('assetId',asset,'renderFingerprint',repeat('c',64)) WHERE workspace_id=ws AND id=previous.id;
  n := n+1;
  op := public.start_workflow_operation(ws,'preview_image','draft',draft,1,lpad(to_hex(n),64,'0'),input || jsonb_build_object('renderFingerprint',repeat('c',64)));
  op := public.claim_workflow_operation(ws,op.id,1,120,150,3);
  IF op.status <> 'running' OR op.provider_call_count <> 0 THEN RAISE EXCEPTION 'Saved-avatar cache was not reusable'; END IF;
  PERFORM public.complete_preview_operation(ws,op.id,1,op.input_fingerprint,asset,repeat('c',64));
  n := n+1;
  op := public.start_workflow_operation(ws,'preview_image','draft',draft,1,lpad(to_hex(n),64,'0'),input);
  UPDATE public.workflow_drafts SET revision=2 WHERE workspace_id=ws AND id=draft;
  op := public.claim_workflow_operation(ws,op.id,1,120,150,3);
  IF op.status <> 'superseded' OR op.attempt_count <> 0 THEN RAISE EXCEPTION 'Cached claim bypassed source revision'; END IF;
  IF (SELECT image_calls FROM public.workflow_provider_daily_budgets
    WHERE workspace_id=ws AND budget_date=(clock_timestamp() AT TIME ZONE 'UTC')::date) <> 3 THEN
    RAISE EXCEPTION 'Cache-only claims changed daily paid budget';
  END IF;
END; $$;

ROLLBACK;
SELECT 'ready cache claims bypass paid eligibility only; capacity, scope, readiness, revision and provider reservation stay fenced; fixtures rolled back' AS result;
