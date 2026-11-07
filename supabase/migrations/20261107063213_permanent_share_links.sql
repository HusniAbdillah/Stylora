ALTER TABLE public.share_links ALTER COLUMN expires_at DROP NOT NULL;
COMMENT ON COLUMN public.share_links.expires_at IS 'NULL keeps a publication active until revoked; existing finite expiries remain enforced.';

CREATE OR REPLACE FUNCTION public.list_saved_looks(
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
        AND l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at > now())) AS is_shared
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
