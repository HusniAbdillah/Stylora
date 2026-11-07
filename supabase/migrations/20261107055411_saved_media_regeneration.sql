CREATE FUNCTION public.regenerate_saved_look_media(
  p_workspace_id uuid, p_saved_look_id uuid, p_expected_media_id uuid, p_idempotency_key uuid
) RETURNS public.saved_look_media LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_snapshot public.saved_look_snapshots; v_latest public.saved_look_media;
  v_media public.saved_look_media; v_operation public.workflow_operations;
  v_fingerprint text; v_preference_hash text; v_created_at timestamptz;
BEGIN
  IF p_workspace_id IS NULL OR p_saved_look_id IS NULL OR p_expected_media_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_MEDIA_REGENERATION_INPUT_INVALID';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':saved-media-retry:' || p_saved_look_id::text, 0));
  SELECT * INTO v_snapshot FROM public.saved_look_snapshots WHERE workspace_id = p_workspace_id AND id = p_saved_look_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_SAVED_LOOK_NOT_FOUND'; END IF;

  v_fingerprint := encode(sha256(convert_to(p_saved_look_id::text || ':regenerate:' || p_idempotency_key::text, 'UTF8')), 'hex');
  SELECT * INTO v_operation FROM public.workflow_operations WHERE workspace_id = p_workspace_id
    AND kind = 'saved_avatar' AND subject_type = 'saved_look' AND subject_id = p_saved_look_id
    AND input_fingerprint = v_fingerprint;
  IF FOUND THEN
    SELECT * INTO v_media FROM public.saved_look_media WHERE workspace_id = p_workspace_id
      AND saved_look_id = p_saved_look_id AND operation_id = v_operation.id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_SAVED_MEDIA_NOT_FOUND'; END IF;
    RETURN v_media;
  END IF;

  SELECT * INTO v_latest FROM public.saved_look_media WHERE workspace_id = p_workspace_id AND saved_look_id = p_saved_look_id
    ORDER BY created_at DESC, id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_SAVED_MEDIA_NOT_FOUND'; END IF;
  IF v_latest.id <> p_expected_media_id THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_SAVED_MEDIA_REVISION_CONFLICT';
  END IF;
  IF v_latest.status IN ('queued', 'running') OR EXISTS (
    SELECT 1 FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND kind = 'saved_avatar'
      AND subject_type = 'saved_look' AND subject_id = p_saved_look_id AND status IN ('queued', 'running', 'partial')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55P03', MESSAGE = 'STYLORA_SAVED_MEDIA_BUSY';
  END IF;

  v_preference_hash := encode(sha256(convert_to(v_snapshot.preference_snapshot::text, 'UTF8')), 'hex');
  v_operation := public.start_workflow_operation(
    p_workspace_id, 'saved_avatar', 'saved_look', p_saved_look_id, v_snapshot.source_revision, v_fingerprint,
    jsonb_build_object('intent', 'regenerate', 'requestId', p_idempotency_key)
  );
  v_created_at := greatest(clock_timestamp(), v_latest.created_at + interval '1 microsecond');
  INSERT INTO public.saved_look_media(workspace_id, saved_look_id, operation_id, preference_snapshot_hash, created_at, updated_at)
    VALUES (p_workspace_id, p_saved_look_id, v_operation.id, v_preference_hash, v_created_at, v_created_at)
    RETURNING * INTO v_media;
  RETURN v_media;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_saved_look_media(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.regenerate_saved_look_media(uuid, uuid, uuid, uuid) TO service_role;
