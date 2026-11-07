-- An invalidated historical option may retain a missing slot after item deletion.
CREATE OR REPLACE FUNCTION public.stylora_guard_option_item() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_type text; v_current boolean; v_status text;
BEGIN
  SELECT option_type, is_current, status INTO v_type, v_current, v_status
  FROM public.outfit_options
  WHERE workspace_id = NEW.workspace_id AND look_id = NEW.look_id
    AND id = NEW.option_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'STYLORA_OPTION_PARENT_NOT_FOUND';
  END IF;
  IF v_type = 'from_wardrobe' AND v_current AND v_status = 'ready'
    AND NEW.item_kind <> 'owned' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OWNED_ONLY_OPTION';
  END IF;
  IF NEW.item_kind = 'owned' AND NOT EXISTS (
    SELECT 1 FROM public.wardrobe_items
    WHERE workspace_id = NEW.workspace_id AND id = NEW.wardrobe_item_id
      AND inventory_status = 'owned' AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OWNED_ITEM_REQUIRED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.outfit_option_items
    WHERE workspace_id = NEW.workspace_id AND option_id = NEW.option_id
      AND slot_id = NEW.slot_id AND id <> NEW.id
      AND (category <> NEW.category OR position <> NEW.position)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_SLOT_CONTRACT_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.wardrobe_item_command(
  p_workspace_id uuid, p_item_id uuid, p_expected_revision integer,
  p_action text, p_payload jsonb DEFAULT '{}'
) RETURNS public.wardrobe_items
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  w public.wardrobe_items;
  d public.workflow_drafts;
  affected_options uuid[];
  affected_capsules uuid[];
  brief_key text;
  capsule_brief jsonb;
  draft_payload jsonb;
  capsule_revision integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_workspace_id::text, 417)
  );
  SELECT * INTO w FROM public.wardrobe_items
  WHERE workspace_id = p_workspace_id AND id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'WARDROBE_ITEM_NOT_FOUND';
  END IF;
  IF w.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'WARDROBE_REVISION_CONFLICT';
  END IF;

  IF p_action = 'delete' THEN
    SELECT coalesce(array_agg(DISTINCT option_id), '{}') INTO affected_options
    FROM public.outfit_option_items
    WHERE workspace_id = p_workspace_id AND wardrobe_item_id = w.id;
    SELECT coalesce(array_agg(c.id), '{}') INTO affected_capsules
    FROM public.capsules c
    WHERE c.workspace_id = p_workspace_id AND (
      EXISTS (
        SELECT 1 FROM public.capsule_items i
        WHERE i.workspace_id = p_workspace_id AND i.capsule_id = c.id
          AND i.wardrobe_item_id = w.id
      )
      OR c.brief -> 'includedItemIds' ? w.id::text
      OR c.brief -> 'requiredItemIds' ? w.id::text
      OR c.brief -> 'excludedItemIds' ? w.id::text
    );

    UPDATE public.wardrobe_matches
    SET wardrobe_item_id = NULL, match_type = 'missing', is_current = false
    WHERE workspace_id = p_workspace_id AND wardrobe_item_id = w.id;

    UPDATE public.outfit_options
    SET status = 'unavailable', is_current = false, revision = revision + 1
    WHERE workspace_id = p_workspace_id AND id = ANY(affected_options);
    UPDATE public.outfit_option_items
    SET item_kind = 'missing', wardrobe_item_id = NULL,
      missing_brief = jsonb_build_object(
        'description', 'The wardrobe item was deleted. Generate this outfit again.',
        'category', category
      ),
      requested_category = category,
      requested_brief = 'The wardrobe item was deleted. Generate this outfit again.',
      revision = revision + 1
    WHERE workspace_id = p_workspace_id AND wardrobe_item_id = w.id;

    DELETE FROM public.capsule_outfit_items
    WHERE workspace_id = p_workspace_id AND capsule_id = ANY(affected_capsules);
    DELETE FROM public.capsule_outfits
    WHERE workspace_id = p_workspace_id AND capsule_id = ANY(affected_capsules);
    DELETE FROM public.capsule_items
    WHERE workspace_id = p_workspace_id AND wardrobe_item_id = w.id;
    FOREACH brief_key IN ARRAY ARRAY[
      'includedItemIds', 'requiredItemIds', 'excludedItemIds'
    ] LOOP
      UPDATE public.capsules
      SET brief = jsonb_set(brief, ARRAY[brief_key], (brief -> brief_key) - w.id::text)
      WHERE workspace_id = p_workspace_id AND id = ANY(affected_capsules)
        AND jsonb_typeof(brief -> brief_key) = 'array';
    END LOOP;
    UPDATE public.capsules
    SET missing_additions = '[]', revision = revision + 1
    WHERE workspace_id = p_workspace_id AND id = ANY(affected_capsules);

    FOR d IN
      SELECT * FROM public.workflow_drafts
      WHERE workspace_id = p_workspace_id AND feature_kind = 'capsules'
        AND status = 'active' AND (
          capsule_id = ANY(affected_capsules)
          OR coalesce(payload -> 'brief', payload) -> 'includedItemIds' ? w.id::text
          OR coalesce(payload -> 'brief', payload) -> 'requiredItemIds' ? w.id::text
          OR coalesce(payload -> 'brief', payload) -> 'excludedItemIds' ? w.id::text
        )
      ORDER BY id FOR UPDATE
    LOOP
      capsule_brief := coalesce(d.payload -> 'brief', d.payload);
      FOREACH brief_key IN ARRAY ARRAY[
        'includedItemIds', 'requiredItemIds', 'excludedItemIds'
      ] LOOP
        IF jsonb_typeof(capsule_brief -> brief_key) = 'array' THEN
          capsule_brief := jsonb_set(
            capsule_brief, ARRAY[brief_key], (capsule_brief -> brief_key) - w.id::text
          );
        END IF;
      END LOOP;
      draft_payload := CASE WHEN d.payload ? 'brief'
        THEN jsonb_set(d.payload, '{brief}', capsule_brief)
        ELSE capsule_brief END;
      IF d.capsule_id IS NOT NULL AND d.payload ? 'brief' THEN
        SELECT revision INTO capsule_revision FROM public.capsules
        WHERE workspace_id = p_workspace_id AND id = d.capsule_id;
        draft_payload := jsonb_set(
          draft_payload, '{capsuleRevision}', to_jsonb(capsule_revision)
        );
      END IF;
      UPDATE public.workflow_drafts
      SET payload = draft_payload, revision = revision + 1
      WHERE workspace_id = p_workspace_id AND id = d.id;
    END LOOP;

    UPDATE public.workflow_drafts
    SET status = 'discarded', revision = revision + 1
    WHERE workspace_id = p_workspace_id AND feature_kind = 'wardrobe'
      AND status = 'active' AND payload -> 'editor' ->> 'itemId' = w.id::text;
    DELETE FROM public.wardrobe_items
    WHERE workspace_id = p_workspace_id AND id = w.id;
    -- Immutable saved snapshots can still refer to this item's ready image asset.
    RETURN w;
  ELSIF p_action = 'edit' THEN
    UPDATE public.wardrobe_items
    SET name = p_payload ->> 'name', category = p_payload ->> 'category',
      subcategory = p_payload ->> 'subcategory',
      description = p_payload ->> 'description', color = p_payload ->> 'color',
      attributes = p_payload -> 'attributes', corrections = p_payload -> 'corrections',
      notes = p_payload ->> 'notes', revision = revision + 1
    WHERE workspace_id = p_workspace_id AND id = w.id RETURNING * INTO w;
  ELSIF p_action = 'mark_owned' THEN
    UPDATE public.wardrobe_items
    SET inventory_status = 'owned', revision = revision + 1
    WHERE workspace_id = p_workspace_id AND id = w.id RETURNING * INTO w;
  ELSIF p_action = 'replace_photo' THEN
    SELECT * INTO d FROM public.workflow_drafts
    WHERE workspace_id = p_workspace_id AND id = (p_payload ->> 'draftId')::uuid
      AND feature_kind = 'wardrobe' AND status = 'active'
      AND revision = (p_payload ->> 'draftRevision')::integer FOR UPDATE;
    IF NOT FOUND OR d.asset_id IS NULL OR d.payload -> 'saved' <> '{}'::jsonb THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'WARDROBE_DRAFT_CONFLICT';
    END IF;
    PERFORM 1 FROM public.assets
    WHERE workspace_id = p_workspace_id AND id = d.asset_id
      AND bucket = 'wardrobe' AND status = 'ready' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'WARDROBE_ASSET_NOT_FOUND';
    END IF;
    UPDATE public.wardrobe_items
    SET asset_id = d.asset_id, revision = revision + 1
    WHERE workspace_id = p_workspace_id AND id = w.id RETURNING * INTO w;
    UPDATE public.workflow_drafts SET status = 'completed', revision = revision + 1
    WHERE workspace_id = p_workspace_id AND id = d.id;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'WARDROBE_ACTION_INVALID';
  END IF;
  RETURN w;
END;
$$;

CREATE OR REPLACE FUNCTION public.wardrobe_draft_command(
  p_workspace_id uuid, p_draft_id uuid, p_expected_revision integer,
  p_action text, p_payload jsonb DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE d public.workflow_drafts; a public.assets; w public.wardrobe_items; key text; piece_id text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text,417));
  SELECT * INTO d FROM public.workflow_drafts WHERE workspace_id=p_workspace_id AND id=p_draft_id AND feature_kind='wardrobe' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='WARDROBE_DRAFT_NOT_FOUND'; END IF;
  IF p_action='confirm' THEN
    piece_id := p_payload->>'proposalId';
    key := 'wardrobe-draft.v1:'||d.id::text||':'||piece_id;
    SELECT * INTO w FROM public.wardrobe_items WHERE workspace_id=p_workspace_id AND import_idempotency_key=key;
    IF FOUND THEN RETURN jsonb_build_object('draft',to_jsonb(d),'itemId',w.id); END IF;
    IF d.payload->'saved' ? piece_id THEN
      RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='WARDROBE_SAVED_ITEM_DELETED';
    END IF;
  END IF;
  IF d.status<>'active' OR d.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='WARDROBE_REVISION_CONFLICT';
  END IF;
  IF p_action='attach' THEN
    SELECT * INTO a FROM public.assets WHERE workspace_id=p_workspace_id AND id=(p_payload->>'assetId')::uuid AND bucket='wardrobe' AND status IN ('pending','ready') FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='WARDROBE_ASSET_NOT_FOUND'; END IF;
    IF split_part(a.storage_path,'/',1)<>p_workspace_id::text OR split_part(a.storage_path,'/',2)<>a.id::text THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='WARDROBE_ASSET_PATH_INVALID';
    END IF;
    UPDATE public.assets SET status='ready',revision=revision+1 WHERE workspace_id=p_workspace_id AND id=a.id AND status='pending';
    UPDATE public.workflow_drafts SET asset_id=a.id,payload=jsonb_build_object('version','wardrobe-draft.v1','mode','manual','proposals','[]'::jsonb,'saved','{}'::jsonb,'metadata','{}'::jsonb),current_step='review',revision=revision+1 WHERE workspace_id=p_workspace_id AND id=d.id RETURNING * INTO d;
  ELSIF p_action IN ('save','manual') THEN
    IF jsonb_typeof(p_payload)<>'object' OR p_payload->>'version'<>'wardrobe-draft.v1' OR jsonb_typeof(p_payload->'proposals')<>'array' OR jsonb_array_length(p_payload->'proposals')>24 OR p_payload->'saved' IS DISTINCT FROM d.payload->'saved' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WARDROBE_DRAFT_INVALID';
    END IF;
    UPDATE public.workflow_drafts SET payload=p_payload,revision=revision+1 WHERE workspace_id=p_workspace_id AND id=d.id RETURNING * INTO d;
  ELSIF p_action='discard' THEN
    UPDATE public.workflow_drafts SET status='discarded',revision=revision+1 WHERE workspace_id=p_workspace_id AND id=d.id RETURNING * INTO d;
  ELSIF p_action='confirm' THEN
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.payload->'proposals') x WHERE x->>'id'=piece_id) THEN
      RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='WARDROBE_PROPOSAL_NOT_FOUND';
    END IF;
    PERFORM 1 FROM public.assets WHERE workspace_id=p_workspace_id AND id=d.asset_id AND bucket='wardrobe' AND status='ready' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='WARDROBE_ASSET_NOT_FOUND'; END IF;
    INSERT INTO public.wardrobe_items(workspace_id,name,category,subcategory,description,color,attributes,inferred_attributes,provenance,corrections,confidence,uncertainty,asset_id,source_type,inventory_status,import_idempotency_key)
    VALUES(p_workspace_id,p_payload->>'name',p_payload->>'category',p_payload->>'subcategory',coalesce(p_payload->>'description',''),coalesce(p_payload->>'color',''),p_payload->'attributes',p_payload->'inferred_attributes',p_payload->'provenance',p_payload->'corrections',(p_payload->>'confidence')::numeric,p_payload->'uncertainty',d.asset_id,p_payload->>'source_type','owned',key) RETURNING * INTO w;
    UPDATE public.workflow_drafts SET payload=jsonb_set(payload,ARRAY['saved',piece_id],to_jsonb(w.id::text)),revision=revision+1 WHERE workspace_id=p_workspace_id AND id=d.id RETURNING * INTO d;
    IF (SELECT count(*) FROM jsonb_object_keys(d.payload->'saved'))=jsonb_array_length(d.payload->'proposals') THEN
      UPDATE public.workflow_drafts SET status='completed' WHERE workspace_id=p_workspace_id AND id=d.id RETURNING * INTO d;
    END IF;
  ELSE RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WARDROBE_ACTION_INVALID'; END IF;
  RETURN jsonb_build_object('draft',to_jsonb(d),'itemId',w.id);
END;
$$;

-- The archive feature is removed, including the rows already in that state.
DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT workspace_id, id, revision FROM public.wardrobe_items
    WHERE archived_at IS NOT NULL ORDER BY workspace_id, id
  LOOP
    PERFORM public.wardrobe_item_command(
      item.workspace_id, item.id, item.revision, 'delete'
    );
  END LOOP;
END;
$$;
