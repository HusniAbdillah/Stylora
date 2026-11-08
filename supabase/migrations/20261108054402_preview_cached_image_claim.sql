CREATE OR REPLACE FUNCTION public.claim_workflow_operation(
  p_workspace_id uuid, p_operation_id uuid, p_input_revision integer, p_lease_seconds integer DEFAULT 120,
  p_text_daily_limit integer DEFAULT 150, p_image_daily_limit integer DEFAULT 20
) RETURNS public.workflow_operations LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE op public.workflow_operations; revision integer; image_call boolean; active_count bigint;
  budget public.workflow_provider_daily_budgets; checkpoint_exists boolean; cached_image_exists boolean := false;
BEGIN
  IF p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 1 AND 900
    OR p_text_daily_limit IS NULL OR p_text_daily_limit NOT BETWEEN 1 AND 100000
    OR p_image_daily_limit IS NULL OR p_image_daily_limit NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_OPERATION_LEASE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text, 417));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text || ':create-provider-budget', 0));
  SELECT * INTO op FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_OPERATION_NOT_FOUND'; END IF;
  IF p_input_revision IS DISTINCT FROM op.input_revision THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_OPERATION_REVISION_CONFLICT';
  END IF;
  IF op.status IN ('succeeded', 'failed', 'cancelled', 'superseded') THEN RETURN op; END IF;
  IF op.lease_until > clock_timestamp() OR op.next_attempt_at > clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = '55P03', MESSAGE = 'STYLORA_OPERATION_NOT_DUE';
  END IF;
  BEGIN
    revision := public.stylora_subject_revision(p_workspace_id, op.subject_type, op.subject_id);
  EXCEPTION WHEN no_data_found THEN revision := NULL;
  END;
  IF revision IS DISTINCT FROM op.input_revision OR op.cancel_requested_at IS NOT NULL OR op.attempt_count >= 3 THEN
    UPDATE public.workflow_operations SET
      status = CASE WHEN op.cancel_requested_at IS NOT NULL THEN 'cancelled' WHEN revision IS DISTINCT FROM op.input_revision THEN 'superseded' ELSE 'failed' END,
      lease_until = NULL, completed_at = clock_timestamp(), provider_inflight = 0, next_attempt_at = NULL,
      safe_error_code = CASE WHEN op.cancel_requested_at IS NOT NULL THEN NULL WHEN revision IS DISTINCT FROM op.input_revision THEN 'INPUT_SUPERSEDED' ELSE 'RETRY_BUDGET_EXHAUSTED' END
      WHERE workspace_id = p_workspace_id AND id = op.id RETURNING * INTO op;
    UPDATE public.saved_look_media SET status = 'failed' WHERE workspace_id = p_workspace_id AND operation_id = op.id;
    PERFORM public.stylora_record_operation_event(p_workspace_id, op.id, op.status);
    RETURN op;
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.operation_result_checkpoints WHERE workspace_id = p_workspace_id
    AND operation_id = op.id AND input_fingerprint = op.input_fingerprint) INTO checkpoint_exists;
  IF op.kind = 'preview_image' AND op.input->'reuse' IS DISTINCT FROM 'false'::jsonb
    AND coalesce(op.input->>'renderFingerprint', '') ~ '^[a-f0-9]{64}$' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.workflow_operations previous
      JOIN public.assets asset ON asset.workspace_id = previous.workspace_id AND asset.id::text = previous.result_ref->>'assetId'
      WHERE previous.workspace_id = p_workspace_id AND previous.status = 'succeeded'
        AND previous.kind IN ('preview_image', 'saved_avatar')
        AND previous.result_ref->>'renderFingerprint' = op.input->>'renderFingerprint'
        AND asset.bucket = 'previews' AND asset.mime_type = 'image/png' AND asset.status = 'ready'
    ) INTO cached_image_exists;
  END IF;
  image_call := op.kind IN ('preview_image', 'saved_avatar');
  IF op.kind <> 'marketplace_search' AND NOT checkpoint_exists AND NOT cached_image_exists THEN
    IF op.provider_call_count >= 3 THEN
      UPDATE public.workflow_operations SET status = 'failed', lease_until = NULL, completed_at = clock_timestamp(),
        provider_inflight = 0, next_attempt_at = NULL, safe_error_code = 'PROVIDER_OPERATION_BUDGET_EXHAUSTED'
        WHERE workspace_id = p_workspace_id AND id = op.id RETURNING * INTO op;
      PERFORM public.stylora_record_operation_event(p_workspace_id, op.id, 'failed');
      RETURN op;
    END IF;
    SELECT * INTO budget FROM public.workflow_provider_daily_budgets
      WHERE workspace_id = p_workspace_id AND budget_date = (clock_timestamp() AT TIME ZONE 'UTC')::date;
    IF (image_call AND coalesce(budget.image_calls, 0) >= p_image_daily_limit)
      OR (NOT image_call AND coalesce(budget.text_calls, 0) >= p_text_daily_limit) THEN
      RAISE EXCEPTION USING ERRCODE = '55P03', MESSAGE = 'PROVIDER_DAILY_BUDGET_EXHAUSTED';
    END IF;
  END IF;
  IF op.kind <> 'marketplace_search' THEN
    SELECT count(*) INTO active_count FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id <> op.id
      AND status IN ('running', 'partial') AND lease_until > clock_timestamp() AND kind <> 'marketplace_search'
      AND (kind IN ('preview_image', 'saved_avatar')) = image_call;
    IF active_count >= (CASE WHEN image_call THEN 1 ELSE 3 END) THEN
      RAISE EXCEPTION USING ERRCODE = '55P03', MESSAGE = 'PROVIDER_CAPACITY_BUSY';
    END IF;
  END IF;
  UPDATE public.workflow_operations SET status = 'running', attempt_count = attempt_count + 1,
    lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds), provider_inflight = 0, next_attempt_at = NULL
    WHERE workspace_id = p_workspace_id AND id = op.id RETURNING * INTO op;
  PERFORM public.stylora_record_operation_event(p_workspace_id, op.id, 'started', jsonb_build_object('attemptCount', op.attempt_count));
  UPDATE public.saved_look_media SET status = 'running' WHERE workspace_id = p_workspace_id AND operation_id = op.id;
  RETURN op;
END; $$;


