CREATE FUNCTION public.retry_saved_look_media(p_workspace_id uuid, p_saved_look_id uuid)
RETURNS public.saved_look_media LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_media public.saved_look_media; v_operation public.workflow_operations;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':saved-media-retry:' || p_saved_look_id::text, 0));
  PERFORM 1 FROM public.saved_look_snapshots WHERE workspace_id = p_workspace_id AND id = p_saved_look_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_SAVED_LOOK_NOT_FOUND'; END IF;
  SELECT * INTO v_media FROM public.saved_look_media WHERE workspace_id = p_workspace_id AND saved_look_id = p_saved_look_id
    ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_SAVED_MEDIA_NOT_FOUND'; END IF;
  SELECT * INTO v_operation FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = v_media.operation_id
    AND kind = 'saved_avatar' AND subject_type = 'saved_look' AND subject_id = p_saved_look_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_MEDIA_OPERATION_MISMATCH'; END IF;
  IF v_media.status IN ('queued', 'running', 'succeeded') THEN RETURN v_media; END IF;
  IF v_operation.status <> 'failed' THEN RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_MEDIA_RETRY_NOT_READY'; END IF;
  IF v_operation.attempt_count >= 3 THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_MEDIA_RETRY_EXHAUSTED'; END IF;
  UPDATE public.workflow_operations SET status = 'queued', lease_until = NULL, completed_at = NULL,
    cancel_requested_at = NULL, safe_error_code = NULL, result_ref = NULL, provider_request_id = NULL
    WHERE workspace_id = p_workspace_id AND id = v_operation.id;
  UPDATE public.saved_look_media SET status = 'queued', output_asset_id = NULL
    WHERE workspace_id = p_workspace_id AND id = v_media.id RETURNING * INTO v_media;
  RETURN v_media;
END;
$$;

CREATE FUNCTION public.list_saved_looks(
  p_workspace_id uuid, p_filter text DEFAULT 'all', p_limit integer DEFAULT 20,
  p_cursor_created_at timestamptz DEFAULT NULL, p_cursor_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  IF p_filter IS NULL OR p_filter NOT IN ('all', 'shared', 'preparing') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
    OR ((p_cursor_created_at IS NULL) <> (p_cursor_id IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_SAVED_LIST_INPUT_INVALID';
  END IF;
  WITH scoped AS (
    SELECT s.*, latest.status AS latest_media_status,
      EXISTS (SELECT 1 FROM public.share_links l WHERE l.workspace_id = p_workspace_id AND l.saved_look_id = s.id
        AND l.revoked_at IS NULL AND l.expires_at > now()) AS is_shared
    FROM public.saved_look_snapshots s
    LEFT JOIN LATERAL (SELECT m.status FROM public.saved_look_media m
      WHERE m.workspace_id = p_workspace_id AND m.saved_look_id = s.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) latest ON true
    WHERE s.workspace_id = p_workspace_id
  ), totals AS (
    SELECT count(*) AS all_count, count(*) FILTER (WHERE is_shared) AS shared_count,
      count(*) FILTER (WHERE latest_media_status IN ('queued', 'running')) AS preparing_count FROM scoped
  ), page AS (
    SELECT * FROM scoped WHERE (p_filter = 'all' OR (p_filter = 'shared' AND is_shared)
      OR (p_filter = 'preparing' AND latest_media_status IN ('queued', 'running')))
      AND (p_cursor_created_at IS NULL OR (created_at, id) < (p_cursor_created_at, p_cursor_id))
    ORDER BY created_at DESC, id DESC LIMIT p_limit + 1
  ), visible AS (SELECT * FROM page ORDER BY created_at DESC, id DESC LIMIT p_limit)
  SELECT jsonb_build_object(
    'items', coalesce((SELECT jsonb_agg(to_jsonb(v) - ARRAY['latest_media_status', 'is_shared'] ORDER BY v.created_at DESC, v.id DESC) FROM visible v), '[]'::jsonb),
    'counts', jsonb_build_object('all', t.all_count, 'shared', t.shared_count, 'preparing', t.preparing_count),
    'has_more', (SELECT count(*) > p_limit FROM page)
  ) INTO v_result FROM totals t;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.delete_saved_look(p_workspace_id uuid, p_saved_look_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':saved-media-retry:' || p_saved_look_id::text, 0));
  PERFORM 1 FROM public.saved_look_snapshots WHERE workspace_id = p_workspace_id AND id = p_saved_look_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_SAVED_LOOK_NOT_FOUND'; END IF;
  PERFORM 1 FROM public.saved_look_media WHERE workspace_id = p_workspace_id AND saved_look_id = p_saved_look_id FOR UPDATE;
  PERFORM 1 FROM public.workflow_operations WHERE workspace_id = p_workspace_id
    AND kind = 'saved_avatar' AND subject_type = 'saved_look' AND subject_id = p_saved_look_id FOR UPDATE;
  DELETE FROM public.share_links WHERE workspace_id = p_workspace_id AND saved_look_id = p_saved_look_id;
  DELETE FROM public.saved_look_media WHERE workspace_id = p_workspace_id AND saved_look_id = p_saved_look_id;
  DELETE FROM public.workflow_operations WHERE workspace_id = p_workspace_id
    AND kind = 'saved_avatar' AND subject_type = 'saved_look' AND subject_id = p_saved_look_id;
  DELETE FROM public.saved_look_snapshots WHERE workspace_id = p_workspace_id AND id = p_saved_look_id;
  RETURN p_saved_look_id;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_saved_look_media(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_saved_looks(uuid, text, integer, timestamptz, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_saved_look(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retry_saved_look_media(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_saved_looks(uuid, text, integer, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_saved_look(uuid, uuid) TO service_role;

CREATE FUNCTION public.attach_product_candidate(
  p_workspace_id uuid, p_look_id uuid, p_option_id uuid,
  p_option_item_id uuid, p_search_id uuid, p_product_id uuid,
  p_expected_option_revision integer
) RETURNS public.outfit_option_items
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_look public.looks;
  v_option public.outfit_options;
  v_slot public.outfit_option_items;
  v_candidate public.outfit_option_items;
  v_position integer;
BEGIN
  SELECT * INTO v_look FROM public.looks
  WHERE workspace_id=p_workspace_id AND id=p_look_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='STYLORA_LOOK_NOT_FOUND'; END IF;
  SELECT * INTO v_option FROM public.outfit_options
  WHERE workspace_id=p_workspace_id AND look_id=p_look_id AND id=p_option_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='STYLORA_OPTION_NOT_FOUND'; END IF;
  IF p_expected_option_revision IS NULL OR v_option.revision<>p_expected_option_revision
    OR v_option.source_revision<>v_look.revision OR v_option.status<>'ready' THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STYLORA_OPTION_STALE';
  END IF;
  IF v_option.option_type='from_wardrobe' THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='STYLORA_OWNED_ONLY_OPTION';
  END IF;
  SELECT * INTO v_slot FROM public.outfit_option_items
  WHERE workspace_id=p_workspace_id AND look_id=p_look_id AND option_id=p_option_id AND id=p_option_item_id;
  IF NOT FOUND OR v_slot.item_kind='owned' THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='STYLORA_SEARCH_SLOT_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.shopping_searches s
    JOIN public.shopping_results r ON r.workspace_id=s.workspace_id AND r.search_id=s.id
    JOIN public.products p ON p.workspace_id=r.workspace_id AND p.id=r.product_id
    WHERE s.workspace_id=p_workspace_id AND s.id=p_search_id
      AND s.look_id=p_look_id AND s.option_id=p_option_id
      AND s.slot_id=v_slot.slot_id AND s.option_item_id=p_option_item_id
      AND s.option_revision=v_option.revision AND s.status='succeeded'
      AND r.product_id=p_product_id AND p.category=v_slot.category
  ) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='STYLORA_PRODUCT_PROVENANCE_INVALID'; END IF;
  SELECT * INTO v_candidate FROM public.outfit_option_items
  WHERE workspace_id=p_workspace_id AND look_id=p_look_id AND option_id=p_option_id
    AND slot_id=v_slot.slot_id AND product_id=p_product_id
  ORDER BY candidate_position LIMIT 1;
  IF FOUND THEN RETURN v_candidate; END IF;
  SELECT coalesce(max(candidate_position),-1)+1 INTO v_position FROM public.outfit_option_items
  WHERE workspace_id=p_workspace_id AND option_id=p_option_id AND slot_id=v_slot.slot_id;
  INSERT INTO public.outfit_option_items(workspace_id,look_id,option_id,slot_id,category,item_kind,
    piece_id,product_id,rationale,position,candidate_position)
  VALUES(p_workspace_id,p_look_id,p_option_id,v_slot.slot_id,v_slot.category,'product',
    v_slot.piece_id,p_product_id,'Selected from a verified marketplace search.',v_slot.position,v_position)
  RETURNING * INTO v_candidate;
  RETURN v_candidate;
END;
$$;
REVOKE ALL ON FUNCTION public.attach_product_candidate(uuid,uuid,uuid,uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.attach_product_candidate(uuid,uuid,uuid,uuid,uuid,uuid,integer) TO service_role;

