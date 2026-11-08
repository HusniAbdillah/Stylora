BEGIN;
SET LOCAL ROLE service_role;

DO $$
DECLARE ws uuid := gen_random_uuid(); foreign_ws uuid := gen_random_uuid(); draft uuid := gen_random_uuid(); second_draft uuid := gen_random_uuid();
  op public.workflow_operations; second_op public.workflow_operations; first_dispatch public.workflow_dispatch_outbox;
  dispatch public.workflow_dispatch_outbox; previous_token uuid; stable_id uuid; count_rows integer; n integer; due timestamptz;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.workflow_dispatch_outbox'::regclass)
    OR has_table_privilege('anon','public.workflow_dispatch_outbox','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated','public.workflow_dispatch_outbox','SELECT,INSERT,UPDATE,DELETE')
    OR has_function_privilege('anon','public.claim_workflow_dispatches(uuid,integer,integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.finish_workflow_dispatch(uuid,uuid,uuid,boolean,text)','EXECUTE')
    OR has_function_privilege('anon','public.reconcile_workflow_dispatches(uuid,integer)','EXECUTE')
    OR has_schema_privilege('anon','stylora_private','USAGE')
    OR has_schema_privilege('authenticated','stylora_private','USAGE')
    OR has_function_privilege('anon','stylora_private.workflow_dispatch_due(public.workflow_operations)','EXECUTE') THEN
    RAISE EXCEPTION 'Outbox or privileged RPC exposed';
  END IF;
  INSERT INTO public.workspaces(id,name) VALUES(ws,'__dispatch_'||ws),(foreign_ws,'__dispatch_foreign_'||foreign_ws);
  INSERT INTO public.workflow_drafts(id,workspace_id,feature_kind) VALUES(draft,ws,'preview'),(second_draft,ws,'preview');
  op:=public.start_workflow_operation(ws,'preview_image','draft',draft,1,repeat('a',64));
  BEGIN
    INSERT INTO public.workflow_dispatch_outbox(workspace_id,operation_id,dispatch_generation,due_at)
      VALUES(foreign_ws,op.id,1,clock_timestamp());
    RAISE EXCEPTION 'Foreign operation parent accepted by outbox';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  SELECT * INTO first_dispatch FROM public.workflow_dispatch_outbox WHERE workspace_id=ws AND operation_id=op.id AND is_current;
  IF first_dispatch.state<>'pending' OR first_dispatch.dispatch_generation<>1 OR first_dispatch.due_at>clock_timestamp() THEN
    RAISE EXCEPTION 'Queued allocation did not atomically create an immediate dispatch';
  END IF;
  UPDATE public.workflow_operations SET result_ref='{"provider":{"latencyMs":1}}',model='fixture-model' WHERE workspace_id=ws AND id=op.id;
  IF (SELECT count(*) FROM public.workflow_dispatch_outbox WHERE workspace_id=ws AND operation_id=op.id)<>1 THEN
    RAISE EXCEPTION 'Metadata-only update looped dispatch';
  END IF;
  SELECT count(*) INTO count_rows FROM public.claim_workflow_dispatches(foreign_ws);
  IF count_rows<>0 THEN RAISE EXCEPTION 'Foreign workspace claimed a dispatch'; END IF;
  SELECT * INTO dispatch FROM public.claim_workflow_dispatches(ws,1);
  IF dispatch.id<>first_dispatch.id OR dispatch.state<>'leased' OR dispatch.lease_token IS NULL OR dispatch.attempt_count<>1 THEN
    RAISE EXCEPTION 'Dispatch claim contract invalid';
  END IF;
  SELECT count(*) INTO count_rows FROM public.claim_workflow_dispatches(ws,1);
  IF count_rows<>0 THEN RAISE EXCEPTION 'Healthy lease was reclaimed'; END IF;
  BEGIN
    PERFORM public.finish_workflow_dispatch(foreign_ws,dispatch.id,dispatch.lease_token,true);
    RAISE EXCEPTION 'Foreign workspace finished dispatch';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  previous_token:=dispatch.lease_token;
  UPDATE public.workflow_dispatch_outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE workspace_id=ws AND id=dispatch.id;
  SELECT * INTO dispatch FROM public.claim_workflow_dispatches(ws,1);
  IF dispatch.lease_token=previous_token OR dispatch.attempt_count<>2 THEN RAISE EXCEPTION 'Expired lease did not rotate token'; END IF;
  BEGIN
    PERFORM public.finish_workflow_dispatch(ws,dispatch.id,previous_token,true);
    RAISE EXCEPTION 'Stale token acknowledged newer claim';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  dispatch:=public.finish_workflow_dispatch(ws,dispatch.id,dispatch.lease_token,false,'DISPATCH_HTTP_503');
  due:=dispatch.due_at;
  IF dispatch.state<>'pending' OR due<=clock_timestamp() THEN RAISE EXCEPTION 'Transport failure omitted durable backoff'; END IF;
  dispatch:=public.finish_workflow_dispatch(ws,dispatch.id,dispatch.lease_token,false,'DISPATCH_HTTP_503');
  IF dispatch.due_at IS DISTINCT FROM due THEN RAISE EXCEPTION 'Duplicate finish extended retry schedule'; END IF;
  FOR n IN 1..34 LOOP
    UPDATE public.workflow_dispatch_outbox SET due_at=clock_timestamp()-interval '1 second' WHERE workspace_id=ws AND id=dispatch.id;
    SELECT * INTO dispatch FROM public.claim_workflow_dispatches(ws,1);
    dispatch:=public.finish_workflow_dispatch(ws,dispatch.id,dispatch.lease_token,false,'DISPATCH_HTTP_503');
  END LOOP;
  IF dispatch.attempt_count<>32 OR dispatch.due_at>clock_timestamp()+interval '15 minutes'
    OR (SELECT provider_call_count FROM public.workflow_operations WHERE workspace_id=ws AND id=op.id)<>0 THEN
    RAISE EXCEPTION 'Saturating transport retry changed paid budget or stranded work';
  END IF;
  UPDATE public.workflow_dispatch_outbox SET due_at=clock_timestamp()-interval '1 second' WHERE workspace_id=ws AND id=dispatch.id;
  SELECT * INTO dispatch FROM public.claim_workflow_dispatches(ws,1);
  dispatch:=public.finish_workflow_dispatch(ws,dispatch.id,dispatch.lease_token,true);
  IF dispatch.state<>'published' OR dispatch.published_at IS NULL THEN RAISE EXCEPTION 'Broker acknowledgement not recorded'; END IF;
  stable_id:=dispatch.id;
  PERFORM public.reconcile_workflow_dispatches(ws);
  IF (SELECT id FROM public.workflow_dispatch_outbox WHERE workspace_id=ws AND operation_id=op.id AND is_current)<>stable_id THEN
    RAISE EXCEPTION 'Healthy published message was needlessly republished';
  END IF;
  UPDATE public.workflow_dispatch_outbox SET published_at=clock_timestamp()-interval '7 days 1 second' WHERE workspace_id=ws AND id=stable_id;
  IF public.reconcile_workflow_dispatches(ws)<>1 THEN RAISE EXCEPTION 'Expired transport TTL did not reconcile'; END IF;
  SELECT * INTO dispatch FROM public.workflow_dispatch_outbox WHERE workspace_id=ws AND operation_id=op.id AND is_current;
  IF dispatch.id=stable_id OR dispatch.dispatch_generation<>2 OR dispatch.state<>'pending' THEN RAISE EXCEPTION 'TTL recovery did not create a fresh generation'; END IF;
  op:=public.claim_workflow_operation(ws,op.id,1);
  SELECT * INTO dispatch FROM public.workflow_dispatch_outbox WHERE workspace_id=ws AND operation_id=op.id AND is_current;
  IF dispatch.dispatch_generation<>3 OR dispatch.due_at IS DISTINCT FROM op.lease_until THEN RAISE EXCEPTION 'Execution lease did not schedule recovery'; END IF;
  stable_id:=dispatch.id;
  UPDATE public.workflow_operations SET status='partial',result_ref='{"provider":{"latencyMs":2}}',provider_call_count=1 WHERE workspace_id=ws AND id=op.id;
  IF (SELECT id FROM public.workflow_dispatch_outbox WHERE workspace_id=ws AND operation_id=op.id AND is_current)<>stable_id THEN
    RAISE EXCEPTION 'Partial output or provider metadata rescheduled unchanged lease';
  END IF;
  UPDATE public.workflow_operations SET lease_until=clock_timestamp()+interval '5 minutes' WHERE workspace_id=ws AND id=op.id;
  IF (SELECT id FROM public.workflow_dispatch_outbox WHERE workspace_id=ws AND operation_id=op.id AND is_current)=stable_id THEN
    RAISE EXCEPTION 'New execution lease failed to rotate dispatch generation';
  END IF;
  op:=public.finish_workflow_operation(ws,op.id,op.attempt_count,op.input_fingerprint,'succeeded','{}');
  IF EXISTS(SELECT 1 FROM public.workflow_dispatch_outbox WHERE workspace_id=ws AND operation_id=op.id AND is_current) THEN
    RAISE EXCEPTION 'Terminal operation remained dispatchable';
  END IF;
  second_op:=public.start_workflow_operation(ws,'preview_image','draft',second_draft,1,repeat('b',64));
  second_op:=public.claim_workflow_operation(ws,second_op.id,1);
  second_op:=public.finish_workflow_operation(ws,second_op.id,1,second_op.input_fingerprint,'failed',
    jsonb_build_object('retryable',true,'retryAfter',clock_timestamp()+interval '1 minute'),'OPENAI_HTTP_429');
  SELECT * INTO dispatch FROM public.workflow_dispatch_outbox WHERE workspace_id=ws AND operation_id=second_op.id AND is_current;
  IF dispatch.due_at<clock_timestamp()+interval '59 seconds' THEN RAISE EXCEPTION 'Retryable failure ignored Retry-After'; END IF;
  stable_id:=dispatch.id;
  UPDATE public.workflow_operations SET result_ref=result_ref||'{"provider":{"latencyMs":3}}' WHERE workspace_id=ws AND id=second_op.id;
  IF (SELECT id FROM public.workflow_dispatch_outbox WHERE workspace_id=ws AND operation_id=second_op.id AND is_current)<>stable_id THEN
    RAISE EXCEPTION 'Failed provider-metadata update looped dispatch';
  END IF;
  UPDATE public.workflow_operations SET next_attempt_at=clock_timestamp()+interval '2 minutes' WHERE workspace_id=ws AND id=second_op.id;
  SELECT * INTO dispatch FROM public.workflow_dispatch_outbox WHERE workspace_id=ws AND operation_id=second_op.id AND is_current;
  IF dispatch.id=stable_id OR dispatch.due_at<clock_timestamp()+interval '119 seconds' THEN
    RAISE EXCEPTION 'Changed failed retry schedule did not create a fresh dispatch generation';
  END IF;
  UPDATE public.workflow_operations SET safe_error_code='OPENAI_RESPONSE_REFUSED',result_ref='{"retryable":true}' WHERE workspace_id=ws AND id=second_op.id;
  IF EXISTS(SELECT 1 FROM public.workflow_dispatch_outbox WHERE workspace_id=ws AND operation_id=second_op.id AND is_current) THEN
    RAISE EXCEPTION 'Refusal scheduled automatic work';
  END IF;
  UPDATE public.workflow_operations SET status='queued',completed_at=NULL,safe_error_code=NULL,result_ref=NULL,next_attempt_at=clock_timestamp()+interval '1 minute' WHERE workspace_id=ws AND id=second_op.id;
  DELETE FROM public.workflow_dispatch_outbox WHERE workspace_id=ws AND operation_id=second_op.id;
  IF public.reconcile_workflow_dispatches(ws)<>1 OR public.reconcile_workflow_dispatches(ws)<>0 THEN
    RAISE EXCEPTION 'Legacy reconciliation was not idempotent';
  END IF;
  SELECT count(*) INTO count_rows FROM public.claim_workflow_dispatches(ws);
  IF count_rows<>0 THEN RAISE EXCEPTION 'Future deferred job dispatched too early'; END IF;
  DELETE FROM public.workflow_operations WHERE workspace_id=ws AND id=second_op.id;
  IF EXISTS(SELECT 1 FROM public.workflow_dispatch_outbox WHERE workspace_id=ws AND operation_id=second_op.id) THEN
    RAISE EXCEPTION 'Dispatch did not cascade with its fixture operation';
  END IF;
END; $$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.workflow_dispatch_outbox LIMIT 1;
    RAISE EXCEPTION 'Anonymous direct table access accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.claim_workflow_dispatches(gen_random_uuid());
    RAISE EXCEPTION 'Anonymous dispatch claim accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.reconcile_workflow_dispatches(gen_random_uuid());
    RAISE EXCEPTION 'Authenticated dispatch reconciliation accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;

ROLLBACK;
SELECT 'outbox privacy, atomic wakeups, token race fencing, saturating transport backoff, TTL repair and lifecycle checks passed; fixtures rolled back' AS result;
