CREATE OR REPLACE FUNCTION public.save_studio_look(
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
          (coalesce(w.subcategory, '') ~* '(bag|tote|clutch|backpack|purse|satchel|duffel|briefcase|crossbody|messenger)') = (v_slot.key = 'bags'))) THEN
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
