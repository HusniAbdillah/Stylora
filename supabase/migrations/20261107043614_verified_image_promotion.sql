-- The server verifies PNG bytes before calling completion. Promotion belongs to the fenced transaction.
CREATE OR REPLACE FUNCTION public.stylora_complete_image_operation(
  p_workspace_id uuid, p_operation_id uuid, p_attempt_count integer, p_input_fingerprint text,
  p_output_asset_id uuid, p_render_fingerprint text, p_kind text
) RETURNS public.workflow_operations LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_operation public.workflow_operations; v_result jsonb;
BEGIN
  SELECT * INTO v_operation FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_OPERATION_NOT_FOUND'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('preview_image', 'saved_avatar') OR v_operation.kind <> p_kind THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OPERATION_SUBJECT_MISMATCH';
  END IF;
  IF v_operation.cancel_requested_at IS NOT NULL AND v_operation.status IN ('running', 'partial') THEN
    RETURN public.finish_workflow_operation(p_workspace_id, p_operation_id, p_attempt_count, p_input_fingerprint, 'succeeded');
  END IF;
  IF p_render_fingerprint IS NULL OR p_render_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_RENDER_FINGERPRINT_INVALID';
  END IF;
  IF p_kind = 'preview_image' AND NOT EXISTS (SELECT 1 FROM public.workflow_drafts
    WHERE workspace_id = p_workspace_id AND id = v_operation.subject_id AND feature_kind = 'preview') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_PREVIEW_DRAFT_REQUIRED';
  END IF;
  IF p_kind = 'preview_image' AND v_operation.status IN ('running', 'partial') THEN
    IF v_operation.input ->> 'renderFingerprint' IS DISTINCT FROM p_render_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_RENDER_FINGERPRINT_CONFLICT';
    END IF;
    IF p_attempt_count IS DISTINCT FROM v_operation.attempt_count OR p_input_fingerprint IS DISTINCT FROM v_operation.input_fingerprint
      OR v_operation.lease_until <= clock_timestamp() THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_OPERATION_ATTEMPT_CONFLICT';
    END IF;
    IF jsonb_typeof(v_operation.input -> 'items') IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_operation.input -> 'items') < 1 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_PREVIEW_INPUT_INVALID';
    END IF;
    PERFORM 1 FROM public.wardrobe_items WHERE workspace_id = p_workspace_id
      AND id IN (SELECT (i ->> 'id')::uuid FROM jsonb_array_elements(v_operation.input -> 'items') i)
      ORDER BY id FOR SHARE;
    PERFORM 1 FROM public.user_preferences WHERE workspace_id = p_workspace_id FOR SHARE;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_operation.input -> 'items') i
      LEFT JOIN public.wardrobe_items w ON w.workspace_id = p_workspace_id AND w.id = (i ->> 'id')::uuid
      WHERE w.id IS NULL OR w.inventory_status <> 'owned' OR w.archived_at IS NOT NULL OR w.revision IS DISTINCT FROM (i ->> 'revision')::integer)
      OR coalesce((SELECT revision FROM public.user_preferences WHERE workspace_id = p_workspace_id), 0)
        IS DISTINCT FROM (v_operation.input #>> '{preferences,revision}')::integer THEN
      UPDATE public.workflow_operations SET status = 'superseded', lease_until = NULL,
        completed_at = clock_timestamp(), safe_error_code = 'INPUT_SUPERSEDED', result_ref = NULL
        WHERE workspace_id = p_workspace_id AND id = p_operation_id RETURNING * INTO v_operation;
      PERFORM public.stylora_record_operation_event(p_workspace_id, p_operation_id, 'superseded');
      RETURN v_operation;
    END IF;
  END IF;
  PERFORM 1 FROM public.assets WHERE workspace_id = p_workspace_id AND id = p_output_asset_id
    AND bucket = 'previews' AND status IN ('pending', 'ready') AND mime_type = 'image/png' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_MEDIA_ASSET_NOT_READY'; END IF;
  v_result := jsonb_build_object('assetId', p_output_asset_id, 'renderFingerprint', p_render_fingerprint)
    || CASE WHEN p_kind = 'preview_image' THEN jsonb_build_object('draftId', v_operation.subject_id)
      ELSE jsonb_build_object('savedLookId', v_operation.subject_id) END;
  IF v_operation.status = 'succeeded' AND v_operation.result_ref IS DISTINCT FROM v_result THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_OPERATION_RESULT_CONFLICT';
  END IF;
  v_operation := public.finish_workflow_operation(p_workspace_id, p_operation_id, p_attempt_count, p_input_fingerprint, 'succeeded', v_result);
  IF v_operation.status = 'succeeded' THEN
    UPDATE public.assets SET status = 'ready' WHERE workspace_id = p_workspace_id AND id = p_output_asset_id AND status = 'pending';
  END IF;
  IF p_kind = 'saved_avatar' AND v_operation.status = 'succeeded' THEN
    UPDATE public.saved_look_media SET output_asset_id = p_output_asset_id, status = 'succeeded'
      WHERE workspace_id = p_workspace_id AND operation_id = p_operation_id AND saved_look_id = v_operation.subject_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_SAVED_MEDIA_NOT_FOUND'; END IF;
  END IF;
  RETURN v_operation;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_workflow_operation(p_workspace_id uuid, p_operation_id uuid, p_input_revision integer, p_lease_seconds integer DEFAULT 120)
RETURNS public.workflow_operations LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_operation public.workflow_operations; v_revision integer;
BEGIN
  IF p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 1 AND 900 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_OPERATION_LEASE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text, 417));
  SELECT * INTO v_operation FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_OPERATION_NOT_FOUND'; END IF;
  IF p_input_revision IS DISTINCT FROM v_operation.input_revision THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_OPERATION_REVISION_CONFLICT';
  END IF;
  IF v_operation.status IN ('succeeded', 'failed', 'cancelled', 'superseded') THEN RETURN v_operation; END IF;
  IF v_operation.lease_until > clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = '55P03', MESSAGE = 'STYLORA_OPERATION_ALREADY_CLAIMED';
  END IF;
  BEGIN
    v_revision := public.stylora_subject_revision(p_workspace_id, v_operation.subject_type, v_operation.subject_id);
  EXCEPTION WHEN no_data_found THEN v_revision := NULL;
  END;
  IF v_revision IS DISTINCT FROM v_operation.input_revision OR v_operation.cancel_requested_at IS NOT NULL
    OR (v_operation.attempt_count >= 3 AND (v_operation.lease_until IS NULL OR v_operation.lease_until <= clock_timestamp())) THEN
    UPDATE public.workflow_operations SET
      status = CASE WHEN v_operation.cancel_requested_at IS NOT NULL THEN 'cancelled'
        WHEN v_revision IS DISTINCT FROM v_operation.input_revision THEN 'superseded' ELSE 'failed' END,
      lease_until = NULL, completed_at = clock_timestamp(),
      safe_error_code = CASE WHEN v_operation.cancel_requested_at IS NOT NULL THEN NULL
        WHEN v_revision IS DISTINCT FROM v_operation.input_revision THEN 'INPUT_SUPERSEDED' ELSE 'RETRY_BUDGET_EXHAUSTED' END
      WHERE workspace_id = p_workspace_id AND id = p_operation_id RETURNING * INTO v_operation;
    UPDATE public.saved_look_media SET status = 'failed' WHERE workspace_id = p_workspace_id AND operation_id = p_operation_id;
    PERFORM public.stylora_record_operation_event(p_workspace_id, p_operation_id, v_operation.status);
    RETURN v_operation;
  END IF;
  IF v_operation.kind IN ('preview_image', 'saved_avatar') AND v_operation.status NOT IN ('succeeded', 'failed', 'cancelled', 'superseded')
    AND EXISTS (SELECT 1 FROM public.workflow_operations WHERE workspace_id = p_workspace_id
      AND id <> p_operation_id AND kind IN ('preview_image', 'saved_avatar')
      AND status IN ('running', 'partial') AND lease_until > clock_timestamp()) THEN
    RAISE EXCEPTION USING ERRCODE = '55P03', MESSAGE = 'STYLORA_IMAGE_QUOTA_BUSY';
  END IF;
  UPDATE public.workflow_operations SET status = 'running', attempt_count = attempt_count + 1,
    lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds)
    WHERE workspace_id = p_workspace_id AND id = p_operation_id RETURNING * INTO v_operation;
  IF v_operation.status = 'running' THEN
    PERFORM public.stylora_record_operation_event(p_workspace_id, p_operation_id, 'started', jsonb_build_object('attemptCount', v_operation.attempt_count));
    UPDATE public.saved_look_media SET status = 'running' WHERE workspace_id = p_workspace_id AND operation_id = p_operation_id;
  END IF;
  RETURN v_operation;
END;
$$;


CREATE OR REPLACE FUNCTION public.cancel_workflow_operation(p_workspace_id uuid, p_operation_id uuid)
RETURNS public.workflow_operations LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_operation public.workflow_operations;
BEGIN
  SELECT * INTO v_operation FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_OPERATION_NOT_FOUND'; END IF;
  IF v_operation.status IN ('succeeded', 'failed', 'cancelled', 'superseded') THEN RETURN v_operation; END IF;
  IF v_operation.status IN ('running', 'partial') AND v_operation.lease_until > clock_timestamp() THEN
    UPDATE public.workflow_operations SET cancel_requested_at = coalesce(cancel_requested_at, clock_timestamp())
      WHERE workspace_id = p_workspace_id AND id = p_operation_id RETURNING * INTO v_operation;
    RETURN v_operation;
  END IF;
  UPDATE public.workflow_operations SET status = 'cancelled', cancel_requested_at = clock_timestamp(),
    lease_until = NULL, completed_at = clock_timestamp()
    WHERE workspace_id = p_workspace_id AND id = p_operation_id RETURNING * INTO v_operation;
  UPDATE public.saved_look_media SET status = 'failed' WHERE workspace_id = p_workspace_id AND operation_id = p_operation_id;
  PERFORM public.stylora_record_operation_event(p_workspace_id, p_operation_id, 'cancelled');
  RETURN v_operation;
END;
$$;
