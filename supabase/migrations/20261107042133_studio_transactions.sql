CREATE FUNCTION public.save_capsule_draft(
  p_workspace_id uuid, p_capsule_id uuid, p_expected_revision integer,
  p_title text, p_brief jsonb, p_item_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_capsule public.capsules; v_operation record; v_ids uuid[]; v_locked_operations uuid[];
BEGIN
  IF p_capsule_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 0
    OR p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 160
    OR p_brief IS NULL OR jsonb_typeof(p_brief) <> 'object'
    OR p_item_ids IS NULL OR cardinality(p_item_ids) NOT BETWEEN 0 AND 60
    OR cardinality(p_item_ids) <> (SELECT count(DISTINCT x) FROM unnest(p_item_ids) x)
    OR array_position(p_item_ids, NULL) IS NOT NULL
    OR p_brief -> 'includedItemIds' IS DISTINCT FROM to_jsonb(p_item_ids)
    OR jsonb_typeof(p_brief -> 'requiredItemIds') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_brief -> 'excludedItemIds') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_CAPSULE_DRAFT_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_brief -> 'requiredItemIds') x WHERE NOT x::uuid = ANY(p_item_ids))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_brief -> 'excludedItemIds') x WHERE x::uuid = ANY(p_item_ids)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_CAPSULE_MEMBERSHIP_INVALID';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':capsule:' || p_capsule_id, 0));
  SELECT coalesce(array_agg(id), '{}') INTO v_locked_operations FROM (
    SELECT id FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND subject_type = 'capsule'
      AND subject_id = p_capsule_id AND status IN ('queued','running','partial') ORDER BY id FOR UPDATE
  ) locked;
  SELECT * INTO v_capsule FROM public.capsules WHERE workspace_id = p_workspace_id AND id = p_capsule_id FOR UPDATE;
  IF FOUND THEN
    SELECT coalesce(array_agg(wardrobe_item_id ORDER BY wardrobe_item_id), '{}') INTO v_ids FROM public.capsule_items
      WHERE workspace_id = p_workspace_id AND capsule_id = p_capsule_id;
    IF v_capsule.revision = p_expected_revision + 1 AND v_capsule.title = btrim(p_title) AND v_capsule.brief = p_brief
      AND v_ids = (SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM unnest(p_item_ids) x) THEN
      RETURN jsonb_build_object('id', v_capsule.id, 'revision', v_capsule.revision);
    END IF;
    IF p_expected_revision = 0 OR v_capsule.revision <> p_expected_revision THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_CAPSULE_REVISION_CONFLICT';
    END IF;
  ELSIF p_expected_revision <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_CAPSULE_NOT_FOUND';
  END IF;
  PERFORM 1 FROM public.wardrobe_items WHERE workspace_id = p_workspace_id AND id = ANY(p_item_ids) ORDER BY id FOR SHARE;
  IF (SELECT count(*) FROM public.wardrobe_items WHERE workspace_id = p_workspace_id AND id = ANY(p_item_ids)
    AND inventory_status = 'owned' AND archived_at IS NULL) <> cardinality(p_item_ids) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OWNED_ITEM_REQUIRED';
  END IF;
  IF p_expected_revision = 0 THEN
    INSERT INTO public.capsules(id, workspace_id, title, brief) VALUES (p_capsule_id, p_workspace_id, btrim(p_title), p_brief)
      RETURNING * INTO v_capsule;
  ELSE
    FOR v_operation IN SELECT id FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = ANY(v_locked_operations) ORDER BY id LOOP
      PERFORM public.cancel_workflow_operation(p_workspace_id, v_operation.id);
    END LOOP;
    DELETE FROM public.capsule_outfit_items WHERE workspace_id = p_workspace_id AND capsule_id = p_capsule_id;
    DELETE FROM public.capsule_outfits WHERE workspace_id = p_workspace_id AND capsule_id = p_capsule_id;
    DELETE FROM public.capsule_items WHERE workspace_id = p_workspace_id AND capsule_id = p_capsule_id;
    UPDATE public.capsules SET title = btrim(p_title), brief = p_brief, missing_additions = '[]', revision = revision + 1
      WHERE workspace_id = p_workspace_id AND id = p_capsule_id RETURNING * INTO v_capsule;
  END IF;
  INSERT INTO public.capsule_items(workspace_id, capsule_id, wardrobe_item_id)
    SELECT p_workspace_id, p_capsule_id, unnest(p_item_ids);
  RETURN jsonb_build_object('id', v_capsule.id, 'revision', v_capsule.revision);
END;
$$;

CREATE FUNCTION public.commit_capsule_generation(
  p_workspace_id uuid, p_operation_id uuid, p_attempt_count integer, p_input_fingerprint text,
  p_capsule_id uuid, p_expected_revision integer, p_outfits jsonb, p_missing_additions jsonb
) RETURNS public.workflow_operations LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_operation public.workflow_operations; v_capsule public.capsules; v_outfit jsonb; v_slot jsonb;
  v_preference_revision integer; v_ids uuid[]; v_outfit_ids uuid[]; v_addition jsonb;
BEGIN
  SELECT * INTO v_operation FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = p_operation_id FOR UPDATE;
  IF NOT FOUND OR v_operation.kind <> 'capsule_generation' OR v_operation.subject_type <> 'capsule' OR v_operation.subject_id <> p_capsule_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OPERATION_SUBJECT_MISMATCH';
  END IF;
  IF p_attempt_count IS DISTINCT FROM v_operation.attempt_count OR p_input_fingerprint IS DISTINCT FROM v_operation.input_fingerprint THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_OPERATION_ATTEMPT_CONFLICT';
  END IF;
  IF v_operation.status = 'succeeded' THEN RETURN v_operation; END IF;
  PERFORM 1 FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;
  SELECT * INTO v_capsule FROM public.capsules WHERE workspace_id = p_workspace_id AND id = p_capsule_id FOR UPDATE;
  IF NOT FOUND OR v_capsule.revision IS DISTINCT FROM p_expected_revision OR v_operation.input_revision IS DISTINCT FROM p_expected_revision
    OR v_operation.input -> 'brief' IS DISTINCT FROM v_capsule.brief THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_CAPSULE_REVISION_CONFLICT';
  END IF;
  PERFORM 1 FROM public.wardrobe_items w JOIN public.capsule_items i ON i.workspace_id = w.workspace_id AND i.wardrobe_item_id = w.id
    WHERE i.workspace_id = p_workspace_id AND i.capsule_id = p_capsule_id ORDER BY w.id FOR SHARE OF w;
  SELECT coalesce(array_agg(i.wardrobe_item_id), '{}') INTO v_ids FROM public.capsule_items i
    WHERE i.workspace_id = p_workspace_id AND i.capsule_id = p_capsule_id;
  IF cardinality(v_ids) = 0 OR jsonb_typeof(v_operation.input -> 'itemRevisions') IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(v_operation.input -> 'itemRevisions')) <> cardinality(v_ids)
    OR EXISTS (SELECT 1 FROM public.wardrobe_items w WHERE w.workspace_id = p_workspace_id AND w.id = ANY(v_ids)
      AND (w.inventory_status <> 'owned' OR w.archived_at IS NOT NULL OR (v_operation.input -> 'itemRevisions' ->> w.id::text)::integer IS DISTINCT FROM w.revision)) THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_CAPSULE_INVENTORY_CHANGED';
  END IF;
  SELECT revision INTO v_preference_revision FROM public.user_preferences WHERE workspace_id = p_workspace_id FOR SHARE;
  IF (v_operation.input ->> 'preferenceRevision')::integer IS DISTINCT FROM coalesce(v_preference_revision, 0) THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_CAPSULE_PREFERENCES_CHANGED';
  END IF;
  IF jsonb_typeof(p_outfits) IS DISTINCT FROM 'array' OR jsonb_array_length(p_outfits) NOT BETWEEN 3 AND 6
    OR jsonb_typeof(p_missing_additions) IS DISTINCT FROM 'array' OR jsonb_array_length(p_missing_additions) > 3
    OR jsonb_array_length(p_outfits) IS DISTINCT FROM (v_capsule.brief ->> 'targetOutfits')::integer THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_CAPSULE_OUTPUT_INVALID';
  END IF;
  SELECT array_agg((x ->> 'id')::uuid) INTO v_outfit_ids FROM jsonb_array_elements(p_outfits) x;
  IF cardinality(v_outfit_ids) <> (SELECT count(DISTINCT x) FROM unnest(v_outfit_ids) x)
    OR array_position(v_outfit_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_CAPSULE_OUTPUT_INVALID';
  END IF;
  FOR v_addition IN SELECT * FROM jsonb_array_elements(p_missing_additions) LOOP
    IF v_addition ->> 'key' IS NULL OR jsonb_typeof(v_addition -> 'supportingItemIds') IS DISTINCT FROM 'array'
      OR jsonb_typeof(v_addition -> 'unlockedOutfitIds') IS DISTINCT FROM 'array'
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_addition -> 'supportingItemIds') x WHERE NOT x::uuid = ANY(v_ids))
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_addition -> 'unlockedOutfitIds') x WHERE NOT x::uuid = ANY(v_outfit_ids)) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_CAPSULE_ADDITION_INVALID';
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT x ->> 'key') FROM jsonb_array_elements(p_missing_additions) x) <> jsonb_array_length(p_missing_additions) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_CAPSULE_ADDITION_INVALID';
  END IF;
  FOR v_outfit IN SELECT * FROM jsonb_array_elements(p_outfits) LOOP
    IF jsonb_typeof(v_outfit -> 'wardrobe_item_ids') IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_outfit -> 'wardrobe_item_ids') NOT BETWEEN 1 AND 20
      OR jsonb_typeof(v_outfit -> 'proposed_slots') IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_outfit -> 'wardrobe_item_ids') + jsonb_array_length(v_outfit -> 'proposed_slots') > 20
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_outfit -> 'wardrobe_item_ids') x WHERE NOT x::uuid = ANY(v_ids))
      OR (SELECT count(DISTINCT x) FROM jsonb_array_elements_text(v_outfit -> 'wardrobe_item_ids') x) <> jsonb_array_length(v_outfit -> 'wardrobe_item_ids') THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_CAPSULE_COMPOSITION_INVALID';
    END IF;
    FOR v_slot IN SELECT * FROM jsonb_array_elements(v_outfit -> 'proposed_slots') LOOP
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_missing_additions) x
        WHERE x ->> 'key' = v_slot ->> 'additionKey' AND x -> 'brief' = v_slot -> 'brief'
          AND x -> 'unlockedOutfitIds' @> jsonb_build_array(v_outfit ->> 'id')) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_CAPSULE_ADDITION_INVALID';
      END IF;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_capsule.brief -> 'requiredItemIds') x
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_outfits) o WHERE o -> 'wardrobe_item_ids' @> jsonb_build_array(x))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_CAPSULE_REQUIRED_ITEM_MISSING';
  END IF;
  v_operation := public.finish_workflow_operation(p_workspace_id, p_operation_id, p_attempt_count, p_input_fingerprint,
    'succeeded', jsonb_build_object('capsuleId', p_capsule_id, 'outfitIds', to_jsonb(v_outfit_ids)));
  IF v_operation.status <> 'succeeded' THEN RETURN v_operation; END IF;
  DELETE FROM public.capsule_outfit_items WHERE workspace_id = p_workspace_id AND capsule_id = p_capsule_id;
  DELETE FROM public.capsule_outfits WHERE workspace_id = p_workspace_id AND capsule_id = p_capsule_id;
  FOR v_outfit IN SELECT * FROM jsonb_array_elements(p_outfits) LOOP
    INSERT INTO public.capsule_outfits(id, workspace_id, capsule_id, title, rationale, explanation, inputs_used, uncertainty, proposed_slots, source_revision)
      VALUES ((v_outfit ->> 'id')::uuid, p_workspace_id, p_capsule_id, v_outfit ->> 'title', v_outfit ->> 'rationale',
        v_outfit -> 'explanation', v_outfit -> 'inputs_used', v_outfit -> 'uncertainty', v_outfit -> 'proposed_slots', p_expected_revision);
    INSERT INTO public.capsule_outfit_items(workspace_id, capsule_id, outfit_id, wardrobe_item_id, position)
      SELECT p_workspace_id, p_capsule_id, (v_outfit ->> 'id')::uuid, x::uuid, ordinality - 1
      FROM jsonb_array_elements_text(v_outfit -> 'wardrobe_item_ids') WITH ORDINALITY AS items(x, ordinality);
  END LOOP;
  UPDATE public.capsules SET missing_additions = p_missing_additions WHERE workspace_id = p_workspace_id AND id = p_capsule_id;
  RETURN v_operation;
END;
$$;

CREATE FUNCTION public.save_studio_look(
  p_workspace_id uuid, p_source_kind text, p_source_id uuid, p_parent_id uuid,
  p_expected_revision integer, p_idempotency_key text, p_title text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_saved public.saved_look_snapshots; v_operation public.workflow_operations; v_source jsonb;
  v_draft public.workflow_drafts; v_outfit public.capsule_outfits; v_ids uuid[]; v_items jsonb;
  v_preferences jsonb; v_preference_revision integer; v_preference_hash text; v_item_revisions jsonb;
  v_missing jsonb := '[]'; v_rationale text := ''; v_inputs jsonb := '{}'; v_uncertainty jsonb := '[]';
  v_reuse_asset uuid; v_render_fingerprint text; v_slot record;
BEGIN
  IF p_source_kind IS NULL OR p_source_kind NOT IN ('preview', 'capsule') OR p_source_id IS NULL
    OR p_expected_revision IS NULL OR p_expected_revision < 1 OR p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 160
    OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STYLORA_SAVE_INPUT_INVALID';
  END IF;
  v_source := jsonb_build_object('kind', p_source_kind, 'id', p_source_id, 'parentId', p_parent_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':save:' || p_idempotency_key, 0));
  SELECT * INTO v_saved FROM public.saved_look_snapshots WHERE workspace_id = p_workspace_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_saved.inputs_used -> 'studio_source' IS DISTINCT FROM v_source OR v_saved.source_revision <> p_expected_revision OR v_saved.title <> btrim(p_title) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_SAVE_IDEMPOTENCY_KEY_REUSED';
    END IF;
    SELECT * INTO STRICT v_operation FROM public.workflow_operations WHERE workspace_id = p_workspace_id
      AND kind = 'saved_avatar' AND subject_type = 'saved_look' AND subject_id = v_saved.id ORDER BY created_at LIMIT 1;
    RETURN jsonb_build_object('savedLookId', v_saved.id, 'operationId', v_operation.id);
  END IF;
  PERFORM 1 FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF p_source_kind = 'preview' THEN
    SELECT * INTO v_draft FROM public.workflow_drafts WHERE workspace_id = p_workspace_id AND id = p_source_id
      AND feature_kind = 'preview' AND status = 'active' FOR UPDATE;
    IF NOT FOUND OR p_parent_id IS NOT NULL OR v_draft.revision <> p_expected_revision
      OR jsonb_typeof(v_draft.payload -> 'selection') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_PREVIEW_REVISION_CONFLICT';
    END IF;
    FOR v_slot IN SELECT key, value FROM jsonb_each_text(v_draft.payload -> 'selection') LOOP
      IF v_slot.key NOT IN ('top', 'bottom', 'dress', 'outerwear', 'shoes', 'bags', 'accessories') OR v_slot.value IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_PREVIEW_SELECTION_INVALID';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.wardrobe_items w WHERE w.workspace_id = p_workspace_id AND w.id = v_slot.value::uuid
        AND w.category = CASE WHEN v_slot.key IN ('bags', 'accessories') THEN 'accessory' ELSE v_slot.key END
        AND (v_slot.key NOT IN ('bags', 'accessories') OR
          (lower(coalesce(w.subcategory, '')) IN ('bag','tote','clutch','backpack','handbag')) = (v_slot.key = 'bags'))) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_PREVIEW_SELECTION_INVALID';
      END IF;
    END LOOP;
    SELECT array_agg(value::uuid ORDER BY key) INTO v_ids FROM jsonb_each_text(v_draft.payload -> 'selection');
  ELSE
    PERFORM 1 FROM public.capsules WHERE workspace_id = p_workspace_id AND id = p_parent_id AND revision = p_expected_revision FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_CAPSULE_REVISION_CONFLICT'; END IF;
    SELECT * INTO v_outfit FROM public.capsule_outfits WHERE workspace_id = p_workspace_id AND capsule_id = p_parent_id
      AND id = p_source_id AND source_revision = p_expected_revision FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_CAPSULE_OUTFIT_NOT_FOUND'; END IF;
    SELECT array_agg(wardrobe_item_id ORDER BY position) INTO v_ids FROM public.capsule_outfit_items
      WHERE workspace_id = p_workspace_id AND capsule_id = p_parent_id AND outfit_id = p_source_id;
    SELECT coalesce(jsonb_agg(x -> 'brief'), '[]') INTO v_missing FROM jsonb_array_elements(v_outfit.proposed_slots) x;
    v_rationale := v_outfit.rationale; v_inputs := v_outfit.inputs_used; v_uncertainty := v_outfit.uncertainty;
  END IF;
  IF v_ids IS NULL OR cardinality(v_ids) NOT BETWEEN 1 AND 20 OR cardinality(v_ids) <> (SELECT count(DISTINCT x) FROM unnest(v_ids) x) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_SAVE_COMPOSITION_INVALID';
  END IF;
  PERFORM 1 FROM public.wardrobe_items WHERE workspace_id = p_workspace_id AND id = ANY(v_ids) ORDER BY id FOR SHARE;
  IF (SELECT count(*) FROM public.wardrobe_items WHERE workspace_id = p_workspace_id AND id = ANY(v_ids)
    AND inventory_status = 'owned' AND archived_at IS NULL) <> cardinality(v_ids) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OWNED_ITEM_REQUIRED';
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'schema_version','fashion-item.v1','id',w.id,'name',w.name,'category',w.category,'subcategory',w.subcategory,
    'description',w.description,'attributes',w.attributes,'provenance',w.provenance,'corrections',w.corrections,
    'confidence',w.confidence,'uncertainty',w.uncertainty,'revision',w.revision,'asset_id',w.asset_id,
    'owned_at_save',true,'inventory_status','owned','source_type',w.source_type,
    'source_reference',jsonb_build_object('kind','wardrobe','id',w.id),'source_label','Wardrobe'
    ) ORDER BY array_position(v_ids,w.id)), jsonb_object_agg(w.id::text,w.revision)
    INTO v_items, v_item_revisions FROM public.wardrobe_items w WHERE w.workspace_id = p_workspace_id AND w.id = ANY(v_ids);
  SELECT v_items || coalesce(jsonb_agg(x || jsonb_build_object(
    'schema_version','fashion-item.v1','inventory_status','not_applicable','owned_at_save',false,
    'source_reference',jsonb_build_object('kind','missing_brief'))),'[]') INTO v_items FROM jsonb_array_elements(v_missing) x;
  SELECT jsonb_build_object('revision',u.revision,'style_dna',u.style_dna,'fit_preferences',u.fit_preferences,'body_profile',u.body_profile,'style_notes',u.style_notes), u.revision
    INTO v_preferences, v_preference_revision FROM public.user_preferences u WHERE u.workspace_id = p_workspace_id FOR SHARE;
  v_preferences := coalesce(v_preferences,'{}');
  v_preference_hash := encode(sha256(convert_to(v_preferences::text,'UTF8')),'hex');
  INSERT INTO public.saved_look_snapshots(workspace_id, source_kind, source_revision, title, items, rationale, inputs_used,
    uncertainty, preference_snapshot, idempotency_key)
    VALUES (p_workspace_id,p_source_kind,p_expected_revision,btrim(p_title),v_items,v_rationale,
      v_inputs || jsonb_build_object('studio_source',v_source),v_uncertainty,v_preferences,p_idempotency_key) RETURNING * INTO v_saved;
  v_operation := public.start_workflow_operation(p_workspace_id,'saved_avatar','saved_look',v_saved.id,v_saved.source_revision,
    encode(sha256(convert_to(v_saved.id::text || ':' || v_preference_hash || ':stylora-fashion-v1:fashion-item.v1','UTF8')),'hex'),
    jsonb_build_object('saved_look_id',v_saved.id,'preference_snapshot_hash',v_preference_hash),
    'stylora-fashion-v1','fashion-item.v1',NULL);
  INSERT INTO public.saved_look_media(workspace_id,saved_look_id,operation_id,preference_snapshot_hash)
    VALUES (p_workspace_id,v_saved.id,v_operation.id,v_preference_hash);
  IF p_source_kind = 'preview' THEN
    SELECT a.id, o.result_ref ->> 'renderFingerprint' INTO v_reuse_asset, v_render_fingerprint
      FROM public.workflow_operations o JOIN public.assets a ON a.workspace_id = o.workspace_id AND a.id::text = o.result_ref ->> 'assetId'
      WHERE o.workspace_id = p_workspace_id AND o.kind = 'preview_image' AND o.subject_type = 'draft'
        AND o.subject_id = p_source_id AND o.input_revision = p_expected_revision AND o.status = 'succeeded'
        AND o.input ->> 'renderFingerprint' = o.result_ref ->> 'renderFingerprint'
        AND jsonb_typeof(o.input -> 'items') = 'array'
        AND jsonb_array_length(o.input -> 'items') = cardinality(v_ids)
        AND (SELECT jsonb_object_agg(x ->> 'id', x -> 'revision') FROM jsonb_array_elements(o.input -> 'items') x) = v_item_revisions
        AND (o.input -> 'preferences' ->> 'revision')::integer = coalesce(v_preference_revision,0)
        AND a.bucket = 'previews' AND a.status = 'ready' AND a.mime_type = 'image/png'
      ORDER BY o.created_at DESC LIMIT 1 FOR SHARE OF a;
    IF v_reuse_asset IS NOT NULL THEN
      UPDATE public.workflow_operations SET status = 'succeeded', completed_at = clock_timestamp(),
        result_ref = jsonb_build_object('savedLookId',v_saved.id,'assetId',v_reuse_asset,'renderFingerprint',v_render_fingerprint)
        WHERE workspace_id = p_workspace_id AND id = v_operation.id;
      UPDATE public.saved_look_media SET status = 'succeeded', output_asset_id = v_reuse_asset WHERE workspace_id = p_workspace_id AND operation_id = v_operation.id;
      PERFORM public.stylora_record_operation_event(p_workspace_id,v_operation.id,'completed',jsonb_build_object('reusedPreview',true));
    END IF;
  END IF;
  RETURN jsonb_build_object('savedLookId',v_saved.id,'operationId',v_operation.id);
END;
$$;

CREATE FUNCTION public.delete_capsule(
  p_workspace_id uuid, p_capsule_id uuid, p_expected_revision integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_operation record; v_locked_operations uuid[];
BEGIN
  SELECT coalesce(array_agg(id), '{}') INTO v_locked_operations FROM (
    SELECT o.id FROM public.workflow_operations o WHERE o.workspace_id = p_workspace_id
      AND o.status IN ('queued','running','partial') AND (
        (o.subject_type = 'capsule' AND o.subject_id = p_capsule_id) OR
        (o.subject_type = 'draft' AND EXISTS (SELECT 1 FROM public.workflow_drafts d
          WHERE d.workspace_id = p_workspace_id AND d.id = o.subject_id AND d.capsule_id = p_capsule_id))) ORDER BY o.id FOR UPDATE OF o
  ) locked;
  PERFORM 1 FROM public.capsules WHERE workspace_id = p_workspace_id AND id = p_capsule_id AND revision = p_expected_revision FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_CAPSULE_REVISION_CONFLICT'; END IF;
  FOR v_operation IN SELECT id FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = ANY(v_locked_operations) ORDER BY id LOOP
    PERFORM public.cancel_workflow_operation(p_workspace_id,v_operation.id);
  END LOOP;
  UPDATE public.workflow_drafts SET status = 'discarded', capsule_id = NULL, revision = revision + 1
    WHERE workspace_id = p_workspace_id AND capsule_id = p_capsule_id;
  DELETE FROM public.capsule_outfit_items WHERE workspace_id = p_workspace_id AND capsule_id = p_capsule_id;
  DELETE FROM public.capsule_outfits WHERE workspace_id = p_workspace_id AND capsule_id = p_capsule_id;
  DELETE FROM public.capsule_items WHERE workspace_id = p_workspace_id AND capsule_id = p_capsule_id;
  DELETE FROM public.capsules WHERE workspace_id = p_workspace_id AND id = p_capsule_id;
  RETURN jsonb_build_object('id',p_capsule_id);
END;
$$;

CREATE FUNCTION public.delete_capsule_outfit(
  p_workspace_id uuid, p_capsule_id uuid, p_outfit_id uuid, p_expected_revision integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_operation record; v_locked_operations uuid[];
BEGIN
  SELECT coalesce(array_agg(id), '{}') INTO v_locked_operations FROM (
    SELECT id FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND subject_type = 'capsule'
      AND subject_id = p_capsule_id AND status IN ('queued','running','partial') ORDER BY id FOR UPDATE
  ) locked;
  PERFORM 1 FROM public.capsules WHERE workspace_id = p_workspace_id AND id = p_capsule_id AND revision = p_expected_revision FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'STYLORA_CAPSULE_REVISION_CONFLICT'; END IF;
  PERFORM 1 FROM public.capsule_outfits WHERE workspace_id = p_workspace_id AND capsule_id = p_capsule_id
    AND id = p_outfit_id AND source_revision = p_expected_revision FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'STYLORA_CAPSULE_OUTFIT_NOT_FOUND'; END IF;
  FOR v_operation IN SELECT id FROM public.workflow_operations WHERE workspace_id = p_workspace_id AND id = ANY(v_locked_operations) ORDER BY id LOOP
    PERFORM public.cancel_workflow_operation(p_workspace_id,v_operation.id);
  END LOOP;
  DELETE FROM public.capsule_outfit_items WHERE workspace_id = p_workspace_id AND capsule_id = p_capsule_id AND outfit_id = p_outfit_id;
  DELETE FROM public.capsule_outfits WHERE workspace_id = p_workspace_id AND capsule_id = p_capsule_id AND id = p_outfit_id;
  UPDATE public.capsules SET revision = revision + 1, missing_additions = (
    SELECT coalesce(jsonb_agg(x || jsonb_build_object('unlockedOutfitIds',remaining,
      'supportingItemIds',(SELECT coalesce(jsonb_agg(s), '[]') FROM jsonb_array_elements(x -> 'supportingItemIds') s
        WHERE EXISTS (SELECT 1 FROM public.capsule_outfit_items i WHERE i.workspace_id = p_workspace_id
          AND i.capsule_id = p_capsule_id AND i.wardrobe_item_id::text = s #>> '{}'
          AND remaining @> jsonb_build_array(i.outfit_id::text))))), '[]') FROM (
      SELECT x, (SELECT coalesce(jsonb_agg(i), '[]') FROM jsonb_array_elements(x -> 'unlockedOutfitIds') i
        WHERE EXISTS (SELECT 1 FROM public.capsule_outfits o WHERE o.workspace_id = p_workspace_id
          AND o.capsule_id = p_capsule_id AND o.id::text = i #>> '{}')) remaining FROM jsonb_array_elements(missing_additions) x
    ) additions WHERE jsonb_array_length(remaining) > 0
  ) WHERE workspace_id = p_workspace_id AND id = p_capsule_id;
  UPDATE public.capsule_outfits SET source_revision = p_expected_revision + 1
    WHERE workspace_id = p_workspace_id AND capsule_id = p_capsule_id;
  UPDATE public.workflow_drafts SET status = 'completed', revision = revision + 1,
    payload = jsonb_set(payload,'{capsuleRevision}',to_jsonb(p_expected_revision + 1),true)
    WHERE workspace_id = p_workspace_id AND capsule_id = p_capsule_id AND feature_kind = 'capsules' AND status <> 'discarded';
  RETURN jsonb_build_object('id',p_outfit_id,'revision',p_expected_revision + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.save_capsule_draft(uuid,uuid,integer,text,jsonb,uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_capsule_draft(uuid,uuid,integer,text,jsonb,uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.commit_capsule_generation(uuid,uuid,integer,text,uuid,integer,jsonb,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_capsule_generation(uuid,uuid,integer,text,uuid,integer,jsonb,jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.save_studio_look(uuid,text,uuid,uuid,integer,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_studio_look(uuid,text,uuid,uuid,integer,text,text) TO service_role;

REVOKE ALL ON FUNCTION public.delete_capsule(uuid,uuid,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_capsule(uuid,uuid,integer) TO service_role;

REVOKE ALL ON FUNCTION public.delete_capsule_outfit(uuid,uuid,uuid,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_capsule_outfit(uuid,uuid,uuid,integer) TO service_role;
