CREATE FUNCTION public.control_create_operation(p_workspace_id uuid,p_operation_id uuid,p_action text)
RETURNS public.workflow_operations LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE op public.workflow_operations; seq bigint;
BEGIN
 SELECT * INTO op FROM public.workflow_operations WHERE workspace_id=p_workspace_id AND id=p_operation_id FOR UPDATE;
 IF NOT FOUND OR op.kind NOT IN ('inspiration_description','inspiration_confidence','wardrobe_match','outfit_options','option_regeneration') THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='OPERATION_NOT_FOUND'; END IF;
 IF p_action='retry' THEN
  IF op.status<>'failed' OR op.attempt_count>=3 OR op.provider_call_count>=3 OR op.result_ref->>'retryable' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RETRY_UNAVAILABLE'; END IF;
  UPDATE public.workflow_operations SET status='queued',completed_at=NULL,lease_until=NULL,provider_inflight=0,safe_error_code=NULL,result_ref=NULL WHERE workspace_id=p_workspace_id AND id=p_operation_id RETURNING * INTO op;
 ELSIF p_action='cancel' THEN
  IF op.status IN ('succeeded','failed','cancelled','superseded') THEN RETURN op; END IF;
  UPDATE public.workflow_operations SET status='cancelled',completed_at=clock_timestamp(),cancel_requested_at=clock_timestamp(),lease_until=NULL WHERE workspace_id=p_workspace_id AND id=p_operation_id RETURNING * INTO op;
  SELECT coalesce(max(sequence),0)+1 INTO seq FROM public.workflow_operation_events WHERE workspace_id=p_workspace_id AND operation_id=p_operation_id;
  INSERT INTO public.workflow_operation_events(workspace_id,operation_id,sequence,source_revision,event_type) VALUES(p_workspace_id,p_operation_id,seq,op.input_revision,'cancelled');
 ELSE RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='OPERATION_ACTION_INVALID'; END IF;
 RETURN op;
END; $$;
REVOKE ALL ON FUNCTION public.control_create_operation(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.control_create_operation(uuid,uuid,text) TO service_role;
