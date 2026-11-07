CREATE OR REPLACE FUNCTION public.stylora_guard_share_link() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_item jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND ((NEW.id, NEW.workspace_id, NEW.saved_look_id, NEW.token_hash, NEW.catchphrase, NEW.public_snapshot, NEW.approved_media_ids, NEW.expires_at, NEW.created_at)
    IS DISTINCT FROM (OLD.id, OLD.workspace_id, OLD.saved_look_id, OLD.token_hash, OLD.catchphrase, OLD.public_snapshot, OLD.approved_media_ids, OLD.expires_at, OLD.created_at)
    OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_SHARE_PUBLICATION_IMMUTABLE';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.revoked_at IS NOT NULL THEN RETURN NEW; END IF;
  IF jsonb_typeof(NEW.public_snapshot->'title') IS DISTINCT FROM 'string'
    OR length(NEW.public_snapshot->>'title') NOT BETWEEN 1 AND 160
    OR (NEW.public_snapshot ? 'catchphrase' AND (jsonb_typeof(NEW.public_snapshot->'catchphrase') IS DISTINCT FROM 'string' OR NEW.public_snapshot->>'catchphrase' <> NEW.catchphrase))
    OR jsonb_typeof(NEW.public_snapshot->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_PUBLIC_SNAPSHOT_INVALID';
  END IF;
  IF jsonb_array_length(NEW.public_snapshot->'items') NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_PUBLIC_ITEMS_INVALID';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(NEW.public_snapshot->'items') LOOP
    IF jsonb_typeof(v_item) <> 'object' OR (v_item - ARRAY['name', 'category', 'colors']) <> '{}'::jsonb
      OR jsonb_typeof(v_item->'name') IS DISTINCT FROM 'string' OR length(v_item->>'name') NOT BETWEEN 1 AND 160
      OR (v_item->>'category') IS NULL OR (v_item->>'category') NOT IN ('top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory')
      OR (v_item ? 'colors' AND jsonb_typeof(v_item->'colors') IS DISTINCT FROM 'array') THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_PUBLIC_ITEM_INVALID';
    END IF;
    IF v_item ? 'colors' THEN
      IF jsonb_array_length(v_item->'colors') > 5 OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_item->'colors') c(value)
        WHERE jsonb_typeof(c.value) <> 'string' OR length(c.value #>> '{}') NOT BETWEEN 1 AND 80
      ) THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_PUBLIC_COLORS_INVALID'; END IF;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM unnest(NEW.approved_media_ids) AS ids(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.saved_look_media m JOIN public.assets a
      ON a.workspace_id = m.workspace_id AND a.id = m.output_asset_id
      WHERE m.workspace_id = NEW.workspace_id AND m.saved_look_id = NEW.saved_look_id AND m.id = ids.id
        AND m.status = 'succeeded' AND a.status = 'ready' AND a.bucket = 'previews')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_SHARE_MEDIA_NOT_APPROVED';
  END IF;
  RETURN NEW;
END;
$$;
