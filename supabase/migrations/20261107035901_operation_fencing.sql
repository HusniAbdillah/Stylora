-- Attempt fencing and image claims share the transaction that publishes operation state.

CREATE OR REPLACE FUNCTION public.stylora_guard_operation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT ((NEW.kind IN ('inspiration_description', 'inspiration_confidence', 'wardrobe_match', 'outfit_options') AND NEW.subject_type = 'look')
    OR (NEW.kind = 'option_regeneration' AND NEW.subject_type = 'outfit_option')
    OR (NEW.kind = 'marketplace_search' AND NEW.subject_type = 'option_item')
    OR (NEW.kind IN ('wardrobe_description', 'preview_image') AND NEW.subject_type = 'draft')
    OR (NEW.kind = 'capsule_generation' AND NEW.subject_type = 'capsule')
    OR (NEW.kind = 'saved_avatar' AND NEW.subject_type = 'saved_look')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OPERATION_SUBJECT_MISMATCH';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.workspace_id, NEW.kind, NEW.subject_type, NEW.subject_id, NEW.input_revision, NEW.input_fingerprint, NEW.input)
    IS DISTINCT FROM (OLD.workspace_id, OLD.kind, OLD.subject_type, OLD.subject_id, OLD.input_revision, OLD.input_fingerprint, OLD.input) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OPERATION_INPUT_IMMUTABLE';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.status NOT IN ('succeeded', 'failed', 'cancelled', 'superseded') THEN
    PERFORM public.stylora_subject_revision(NEW.workspace_id, NEW.subject_type, NEW.subject_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Lock the subject until the transaction finishes so edits cannot race a completion.
CREATE OR REPLACE FUNCTION public.stylora_subject_revision(p_workspace_id uuid, p_subject_type text, p_subject_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_revision integer;
BEGIN
  CASE p_subject_type
    WHEN 'look' THEN SELECT x.revision INTO v_revision FROM public.looks x WHERE x.workspace_id = p_workspace_id AND x.id = p_subject_id FOR SHARE;
    WHEN 'outfit_option' THEN SELECT x.revision INTO v_revision FROM public.outfit_options x WHERE x.workspace_id = p_workspace_id AND x.id = p_subject_id FOR SHARE;
    WHEN 'option_item' THEN SELECT o.revision INTO v_revision FROM public.outfit_option_items x JOIN public.outfit_options o ON o.workspace_id = x.workspace_id AND o.id = x.option_id AND o.look_id = x.look_id WHERE x.workspace_id = p_workspace_id AND x.id = p_subject_id FOR SHARE OF o;
    WHEN 'capsule' THEN SELECT x.revision INTO v_revision FROM public.capsules x WHERE x.workspace_id = p_workspace_id AND x.id = p_subject_id FOR SHARE;
    WHEN 'draft' THEN SELECT x.revision INTO v_revision FROM public.workflow_drafts x WHERE x.workspace_id = p_workspace_id AND x.id = p_subject_id AND x.status = 'active' FOR SHARE;
    WHEN 'saved_look' THEN SELECT x.source_revision INTO v_revision FROM public.saved_look_snapshots x WHERE x.workspace_id = p_workspace_id AND x.id = p_subject_id FOR SHARE;
    ELSE RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_SUBJECT_TYPE_INVALID';
  END CASE;
  IF v_revision IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_SUBJECT_NOT_FOUND';
  END IF;
  RETURN v_revision;
END;
$$;

CREATE FUNCTION public.stylora_record_operation_event(p_workspace_id uuid, p_operation_id uuid, p_event_type text, p_payload jsonb DEFAULT '{}')
RETURNS public.workflow_operation_events LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_operation public.workflow_operations; v_event public.workflow_operation_events;
BEGIN
  SELECT * INTO v_operation FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_OPERATION_NOT_FOUND'; END IF;
  INSERT INTO public.workflow_operation_events(workspace_id, operation_id, sequence, source_revision, event_type, payload)
    SELECT p_workspace_id, p_operation_id, coalesce(max(sequence), 0) + 1, v_operation.input_revision, p_event_type, p_payload
    FROM public.workflow_operation_events WHERE workspace_id = p_workspace_id AND operation_id = p_operation_id
    RETURNING * INTO v_event;
  RETURN v_event;
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
  IF v_operation.lease_until > clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = '55P03', MESSAGE = 'STYLORA_OPERATION_ALREADY_CLAIMED';
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

CREATE FUNCTION public.append_workflow_operation_event(
  p_workspace_id uuid, p_operation_id uuid, p_attempt_count integer, p_input_fingerprint text,
  p_event_type text, p_payload jsonb
) RETURNS public.workflow_operation_events LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_operation public.workflow_operations;
BEGIN
  IF p_event_type IS NULL OR p_event_type NOT IN ('piece_completed', 'confidence_completed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_OPERATION_EVENT_INVALID';
  END IF;
  SELECT * INTO v_operation FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_OPERATION_NOT_FOUND'; END IF;
  IF p_attempt_count IS DISTINCT FROM v_operation.attempt_count OR p_input_fingerprint IS DISTINCT FROM v_operation.input_fingerprint
    OR v_operation.status NOT IN ('running', 'partial') OR v_operation.lease_until <= clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_OPERATION_ATTEMPT_CONFLICT';
  END IF;
  IF public.stylora_subject_revision(p_workspace_id, v_operation.subject_type, v_operation.subject_id) <> v_operation.input_revision THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_OPERATION_REVISION_CONFLICT';
  END IF;
  RETURN public.stylora_record_operation_event(p_workspace_id, p_operation_id, p_event_type, p_payload);
END;
$$;

CREATE FUNCTION public.finish_workflow_operation(
  p_workspace_id uuid, p_operation_id uuid, p_attempt_count integer, p_input_fingerprint text,
  p_status text, p_result_ref jsonb DEFAULT NULL, p_safe_error_code text DEFAULT NULL
) RETURNS public.workflow_operations LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_operation public.workflow_operations; v_revision integer; v_status text := p_status; v_code text := p_safe_error_code;
  v_retry_after timestamptz;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('succeeded', 'failed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_OPERATION_STATUS_INVALID';
  END IF;
  SELECT * INTO v_operation FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_OPERATION_NOT_FOUND'; END IF;
  IF p_attempt_count IS DISTINCT FROM v_operation.attempt_count OR p_input_fingerprint IS DISTINCT FROM v_operation.input_fingerprint THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_OPERATION_ATTEMPT_CONFLICT';
  END IF;
  IF v_operation.status IN ('succeeded', 'failed', 'cancelled', 'superseded') THEN RETURN v_operation; END IF;
  IF v_operation.status NOT IN ('running', 'partial') OR v_operation.lease_until <= clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_OPERATION_LEASE_EXPIRED';
  END IF;
  BEGIN
    v_revision := public.stylora_subject_revision(p_workspace_id, v_operation.subject_type, v_operation.subject_id);
  EXCEPTION WHEN no_data_found THEN v_revision := NULL;
  END;
  IF v_revision IS DISTINCT FROM v_operation.input_revision THEN v_status := 'superseded'; v_code := 'INPUT_SUPERSEDED'; END IF;
  IF v_operation.cancel_requested_at IS NOT NULL THEN v_status := 'cancelled'; v_code := NULL; END IF;
  IF v_status = 'failed' AND (v_code IS NULL OR v_code !~ '^[A-Z][A-Z0-9_]{0,119}$') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_OPERATION_ERROR_CODE_INVALID';
  END IF;
  IF v_status = 'failed' AND p_result_ref ? 'retryAfter' THEN
    v_retry_after := (p_result_ref ->> 'retryAfter')::timestamptz;
    IF v_retry_after IS NULL OR NOT isfinite(v_retry_after) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_RETRY_AFTER_INVALID';
    END IF;
  END IF;
  IF v_status = 'failed' AND p_result_ref ? 'retryable' AND jsonb_typeof(p_result_ref -> 'retryable') <> 'boolean' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_RETRYABLE_INVALID';
  END IF;
  UPDATE public.workflow_operations SET status = v_status, lease_until = NULL, completed_at = clock_timestamp(),
    result_ref = CASE WHEN v_status = 'succeeded' THEN p_result_ref
      WHEN v_status = 'failed' THEN
        CASE WHEN p_result_ref ? 'retryable' THEN jsonb_build_object('retryable', p_result_ref -> 'retryable') ELSE '{}'::jsonb END
        || CASE WHEN v_retry_after IS NOT NULL THEN jsonb_build_object('retryAfter', v_retry_after) ELSE '{}'::jsonb END
      ELSE NULL END,
    safe_error_code = CASE WHEN v_status = 'succeeded' THEN NULL ELSE v_code END
    WHERE workspace_id = p_workspace_id AND id = p_operation_id RETURNING * INTO v_operation;
  IF v_status <> 'succeeded' THEN
    UPDATE public.saved_look_media SET status = 'failed' WHERE workspace_id = p_workspace_id AND operation_id = p_operation_id;
  END IF;
  PERFORM public.stylora_record_operation_event(p_workspace_id, p_operation_id,
    CASE WHEN v_status = 'succeeded' THEN 'completed' ELSE v_status END,
    jsonb_build_object('attemptCount', v_operation.attempt_count, 'resultRef', v_operation.result_ref, 'safeErrorCode', v_operation.safe_error_code));
  RETURN v_operation;
END;
$$;

CREATE FUNCTION public.cancel_workflow_operation(p_workspace_id uuid, p_operation_id uuid)
RETURNS public.workflow_operations LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_operation public.workflow_operations;
BEGIN
  SELECT * INTO v_operation FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_OPERATION_NOT_FOUND'; END IF;
  IF v_operation.status IN ('succeeded', 'failed', 'cancelled', 'superseded') THEN RETURN v_operation; END IF;
  UPDATE public.workflow_operations SET status = 'cancelled', cancel_requested_at = clock_timestamp(),
    lease_until = NULL, completed_at = clock_timestamp()
    WHERE workspace_id = p_workspace_id AND id = p_operation_id RETURNING * INTO v_operation;
  UPDATE public.saved_look_media SET status = 'failed' WHERE workspace_id = p_workspace_id AND operation_id = p_operation_id;
  PERFORM public.stylora_record_operation_event(p_workspace_id, p_operation_id, 'cancelled');
  RETURN v_operation;
END;
$$;

CREATE FUNCTION public.retry_workflow_operation(p_workspace_id uuid, p_operation_id uuid)
RETURNS public.workflow_operations LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_operation public.workflow_operations;
BEGIN
  SELECT * INTO v_operation FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_OPERATION_NOT_FOUND'; END IF;
  IF v_operation.status <> 'failed' OR v_operation.attempt_count >= 3 OR v_operation.cancel_requested_at IS NOT NULL
    OR v_operation.result_ref -> 'retryable' = 'false'::jsonb
    OR v_operation.safe_error_code IS NULL OR v_operation.safe_error_code NOT IN (
      'PROVIDER_TIMEOUT', 'PROVIDER_NETWORK_ERROR', 'PROVIDER_RATE_LIMITED', 'PROVIDER_SERVER_ERROR',
      'OPENAI_CONNECTION_FAILED', 'OPENAI_HTTP_429', 'OPENAI_HTTP_500', 'OPENAI_HTTP_502', 'OPENAI_HTTP_503', 'OPENAI_HTTP_504') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OPERATION_RETRY_INELIGIBLE';
  END IF;
  IF public.stylora_subject_revision(p_workspace_id, v_operation.subject_type, v_operation.subject_id) <> v_operation.input_revision THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_OPERATION_REVISION_CONFLICT';
  END IF;
  IF (v_operation.result_ref ->> 'retryAfter')::timestamptz > clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = '55P03', MESSAGE = 'STYLORA_OPERATION_RETRY_BACKOFF';
  END IF;
  UPDATE public.workflow_operations SET status = 'queued', completed_at = NULL, safe_error_code = NULL, result_ref = NULL
    WHERE workspace_id = p_workspace_id AND id = p_operation_id RETURNING * INTO v_operation;
  UPDATE public.saved_look_media SET status = 'queued' WHERE workspace_id = p_workspace_id AND operation_id = p_operation_id;
  RETURN v_operation;
END;
$$;

CREATE FUNCTION public.stylora_complete_image_operation(
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
    AND bucket = 'previews' AND status = 'ready' AND mime_type = 'image/png' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_MEDIA_ASSET_NOT_READY'; END IF;
  v_result := jsonb_build_object('assetId', p_output_asset_id, 'renderFingerprint', p_render_fingerprint)
    || CASE WHEN p_kind = 'preview_image' THEN jsonb_build_object('draftId', v_operation.subject_id)
      ELSE jsonb_build_object('savedLookId', v_operation.subject_id) END;
  IF v_operation.status = 'succeeded' AND v_operation.result_ref IS DISTINCT FROM v_result THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_OPERATION_RESULT_CONFLICT';
  END IF;
  v_operation := public.finish_workflow_operation(p_workspace_id, p_operation_id, p_attempt_count, p_input_fingerprint, 'succeeded', v_result);
  IF p_kind = 'saved_avatar' AND v_operation.status = 'succeeded' THEN
    UPDATE public.saved_look_media SET output_asset_id = p_output_asset_id, status = 'succeeded'
      WHERE workspace_id = p_workspace_id AND operation_id = p_operation_id AND saved_look_id = v_operation.subject_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_SAVED_MEDIA_NOT_FOUND'; END IF;
  END IF;
  RETURN v_operation;
END;
$$;

CREATE FUNCTION public.complete_preview_operation(
  p_workspace_id uuid, p_operation_id uuid, p_attempt_count integer, p_input_fingerprint text,
  p_output_asset_id uuid, p_render_fingerprint text
) RETURNS public.workflow_operations LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT public.stylora_complete_image_operation(p_workspace_id, p_operation_id, p_attempt_count,
    p_input_fingerprint, p_output_asset_id, p_render_fingerprint, 'preview_image');
$$;

CREATE FUNCTION public.complete_saved_avatar(
  p_workspace_id uuid, p_operation_id uuid, p_attempt_count integer, p_input_fingerprint text,
  p_output_asset_id uuid, p_render_fingerprint text
) RETURNS public.workflow_operations LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT public.stylora_complete_image_operation(p_workspace_id, p_operation_id, p_attempt_count,
    p_input_fingerprint, p_output_asset_id, p_render_fingerprint, 'saved_avatar');
$$;

REVOKE ALL ON FUNCTION public.stylora_complete_image_operation(uuid, uuid, integer, text, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stylora_complete_image_operation(uuid, uuid, integer, text, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.complete_preview_operation(uuid, uuid, integer, text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_preview_operation(uuid, uuid, integer, text, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.complete_saved_avatar(uuid, uuid, integer, text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_saved_avatar(uuid, uuid, integer, text, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.stylora_record_operation_event(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stylora_record_operation_event(uuid, uuid, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.append_workflow_operation_event(uuid, uuid, integer, text, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.append_workflow_operation_event(uuid, uuid, integer, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.claim_workflow_operation(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_workflow_operation(uuid, uuid, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.finish_workflow_operation(uuid, uuid, integer, text, text, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finish_workflow_operation(uuid, uuid, integer, text, text, jsonb, text) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_workflow_operation(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_workflow_operation(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.retry_workflow_operation(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retry_workflow_operation(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.retry_saved_look_media(p_workspace_id uuid, p_saved_look_id uuid)
RETURNS public.saved_look_media LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_media public.saved_look_media;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':saved-media-retry:' || p_saved_look_id::text, 0));
  SELECT * INTO v_media FROM public.saved_look_media WHERE workspace_id = p_workspace_id AND saved_look_id = p_saved_look_id
    ORDER BY created_at DESC, id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_SAVED_MEDIA_NOT_FOUND'; END IF;
  IF v_media.status IN ('queued', 'running', 'succeeded') THEN RETURN v_media; END IF;
  PERFORM public.retry_workflow_operation(p_workspace_id, v_media.operation_id);
  UPDATE public.saved_look_media SET output_asset_id = NULL WHERE workspace_id = p_workspace_id AND id = v_media.id RETURNING * INTO v_media;
  RETURN v_media;
END;
$$;


