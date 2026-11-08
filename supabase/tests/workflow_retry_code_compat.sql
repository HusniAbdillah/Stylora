BEGIN;
SET LOCAL ROLE service_role;

DO $$
DECLARE ws uuid := gen_random_uuid(); look_id uuid := gen_random_uuid(); code text; n integer := 0;
  op public.workflow_operations; retried public.workflow_operations;
BEGIN
  IF has_function_privilege('anon', 'public.stylora_workflow_retryable_code(text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.stylora_workflow_retryable_code(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Retry helper became public';
  END IF;
  INSERT INTO public.workspaces(id,name) VALUES(ws,'__retry_code_compat_'||ws);
  INSERT INTO public.looks(id,workspace_id,title,source_type) VALUES(look_id,ws,'Synthetic legacy retry look','sample');
  FOREACH code IN ARRAY ARRAY['provider_timeout', 'provider_network_error', 'provider_capacity_busy',
    'operation_persistence_failed', 'operation_checkpoint_unavailable', 'PROVIDER_TIMEOUT',
    'WORKFLOW_COMMIT_UNAVAILABLE', 'CHECKPOINT_UNAVAILABLE', 'OPENAI_HTTP_429', 'openai_http_503'] LOOP
    IF public.stylora_workflow_retryable_code(code) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Known code rejected: %', code; END IF;
    n := n + 1;
    op := public.start_workflow_operation(ws,'inspiration_description','look',look_id,1,lpad(to_hex(n),64,'0'),
      jsonb_build_object('lookId',look_id,'lookRevision',1));
    op := public.claim_workflow_operation(ws,op.id,1);
    UPDATE public.workflow_operations SET status='failed', lease_until=NULL, completed_at=clock_timestamp(),
      safe_error_code=code, result_ref='{"retryable":true}' WHERE workspace_id=ws AND id=op.id;
    retried := public.control_create_operation(ws,op.id,'retry');
    IF retried.id <> op.id OR retried.status <> 'queued' OR retried.attempt_count <> 1 OR retried.provider_call_count <> 0 THEN
      RAISE EXCEPTION 'Manual retry changed identity or fencing: %', code;
    END IF;
  END LOOP;
  FOREACH code IN ARRAY ARRAY['provider_unavailable', 'operation_failed', 'unknown_failure', 'OPENAI_UNCONFIGURED',
    'OPENAI_RESPONSE_REFUSED', 'OPENAI_INVALID_OUTPUT', 'openai_output_schema_invalid', ' provider_timeout'] LOOP
    IF public.stylora_workflow_retryable_code(code) IS DISTINCT FROM false THEN RAISE EXCEPTION 'Unsafe code admitted: %', code; END IF;
    n := n + 1;
    op := public.start_workflow_operation(ws,'inspiration_description','look',look_id,1,lpad(to_hex(n),64,'0'),
      jsonb_build_object('lookId',look_id,'lookRevision',1));
    UPDATE public.workflow_operations SET status='failed', completed_at=clock_timestamp(), attempt_count=1,
      safe_error_code=code, result_ref='{"retryable":true}' WHERE workspace_id=ws AND id=op.id;
    BEGIN
      PERFORM public.control_create_operation(ws,op.id,'retry');
      RAISE EXCEPTION 'Unknown or terminal failure manually retried: %', code;
    EXCEPTION WHEN check_violation THEN NULL; END;
  END LOOP;
  UPDATE public.workflow_operations SET safe_error_code='provider_timeout', result_ref='{"retryable":false}' WHERE workspace_id=ws AND id=op.id;
  BEGIN
    PERFORM public.control_create_operation(ws,op.id,'retry');
    RAISE EXCEPTION 'Explicit nonretryable marker ignored';
  EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE public.workflow_operations SET result_ref='{"retryable":true}', attempt_count=3 WHERE workspace_id=ws AND id=op.id;
  BEGIN
    PERFORM public.control_create_operation(ws,op.id,'retry');
    RAISE EXCEPTION 'Attempt limit ignored';
  EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE public.workflow_operations SET attempt_count=1 WHERE workspace_id=ws AND id=op.id;
  BEGIN
    PERFORM public.defer_workflow_operation(ws,op.id,1,op.input_fingerprint,'PROVIDER_TIMEOUT');
    RAISE EXCEPTION 'Defer changed exact stored-code fence';
  EXCEPTION WHEN check_violation THEN NULL; END;
  retried := public.defer_workflow_operation(ws,op.id,1,op.input_fingerprint,'provider_timeout');
  IF retried.status <> 'queued' OR retried.safe_error_code <> 'provider_timeout' OR retried.next_attempt_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Legacy defer did not preserve captured error and backoff';
  END IF;
END; $$;

ROLLBACK;
SELECT 'legacy retry eligibility, canonical codes, terminal denial and unchanged retry fences passed; fixtures rolled back' AS result;
