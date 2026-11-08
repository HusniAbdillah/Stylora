BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE ws uuid := gen_random_uuid(); draft uuid := gen_random_uuid(); op public.workflow_operations;
BEGIN
  IF NOT public.stylora_workflow_retryable_code('AVATAR_CONTEXT_PERSIST_FAILED')
    OR NOT public.stylora_workflow_retryable_code('PROVIDER_SERVER_ERROR')
    OR NOT public.stylora_workflow_retryable_code('PROVIDER_RATE_LIMITED')
    OR NOT public.stylora_workflow_retryable_code('operation_persistence_failed')
    OR public.stylora_workflow_retryable_code('AVATAR_OPERATION_CHANGED')
    OR public.stylora_workflow_retryable_code('STYLORA_OPERATION_INPUT_IMMUTABLE') THEN
    RAISE EXCEPTION 'Retry policy lost transient or terminal classification';
  END IF;
  IF has_function_privilege('anon','public.stylora_workflow_retryable_code(text)','EXECUTE')
    OR has_function_privilege('authenticated','public.stylora_workflow_retryable_code(text)','EXECUTE') THEN
    RAISE EXCEPTION 'Retry helper exposed';
  END IF;
  INSERT INTO public.workspaces(id,name) VALUES(ws,'__avatar_retry_'||ws);
  INSERT INTO public.workflow_drafts(id,workspace_id,feature_kind) VALUES(draft,ws,'preview');
  op := public.start_workflow_operation(ws,'preview_image','draft',draft,1,repeat('a',64));
  UPDATE public.workflow_operations SET status='failed', attempt_count=1,
    completed_at=clock_timestamp(),
    safe_error_code='AVATAR_CONTEXT_PERSIST_FAILED', result_ref='{"retryable":true}'::jsonb
    WHERE workspace_id=ws AND id=op.id;
  IF NOT EXISTS(SELECT 1 FROM public.workflow_dispatch_outbox WHERE workspace_id=ws AND operation_id=op.id AND is_current)
    OR (SELECT provider_call_count FROM public.workflow_operations WHERE workspace_id=ws AND id=op.id) <> 0 THEN
    RAISE EXCEPTION 'Transient context failure lost dispatch or spent provider quota';
  END IF;
  UPDATE public.workflow_operations SET result_ref='{"retryable":false}'::jsonb WHERE workspace_id=ws AND id=op.id;
  IF EXISTS(SELECT 1 FROM public.workflow_dispatch_outbox WHERE workspace_id=ws AND operation_id=op.id AND is_current) THEN
    RAISE EXCEPTION 'Terminal context failure scheduled automatic retry';
  END IF;
  UPDATE public.workflow_operations SET result_ref='{"retryable":true}'::jsonb, attempt_count=3 WHERE workspace_id=ws AND id=op.id;
  IF EXISTS(SELECT 1 FROM public.workflow_dispatch_outbox WHERE workspace_id=ws AND operation_id=op.id AND is_current) THEN
    RAISE EXCEPTION 'Attempt cap bypassed';
  END IF;
END; $$;
ROLLBACK;
SELECT 'avatar context retry policy and outbox gating passed; fixtures rolled back' AS result;
