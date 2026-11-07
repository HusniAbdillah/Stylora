-- PostgREST retries SQLSTATE 40001. Business revision conflicts must return HTTP 409.
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
END; $$;

CREATE OR REPLACE FUNCTION public.wardrobe_item_command(
  p_workspace_id uuid,p_item_id uuid,p_expected_revision integer,p_action text,p_payload jsonb DEFAULT '{}'
) RETURNS public.wardrobe_items LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE w public.wardrobe_items; d public.workflow_drafts;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text,417));
  SELECT * INTO w FROM public.wardrobe_items WHERE workspace_id=p_workspace_id AND id=p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='WARDROBE_ITEM_NOT_FOUND'; END IF;
  IF w.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='WARDROBE_REVISION_CONFLICT'; END IF;
  IF p_action='edit' THEN
    UPDATE public.wardrobe_items SET name=p_payload->>'name',category=p_payload->>'category',subcategory=p_payload->>'subcategory',description=p_payload->>'description',color=p_payload->>'color',attributes=p_payload->'attributes',corrections=p_payload->'corrections',notes=p_payload->>'notes',revision=revision+1 WHERE workspace_id=p_workspace_id AND id=w.id RETURNING * INTO w;
  ELSIF p_action='archive' THEN
    UPDATE public.wardrobe_items SET archived_at=coalesce(archived_at,clock_timestamp()),revision=revision+1 WHERE workspace_id=p_workspace_id AND id=w.id RETURNING * INTO w;
  ELSIF p_action='restore' THEN
    UPDATE public.wardrobe_items SET archived_at=NULL,revision=revision+1 WHERE workspace_id=p_workspace_id AND id=w.id RETURNING * INTO w;
  ELSIF p_action='mark_owned' THEN
    IF w.archived_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WARDROBE_ITEM_ARCHIVED'; END IF;
    UPDATE public.wardrobe_items SET inventory_status='owned',revision=revision+1 WHERE workspace_id=p_workspace_id AND id=w.id RETURNING * INTO w;
  ELSIF p_action='replace_photo' THEN
    SELECT * INTO d FROM public.workflow_drafts WHERE workspace_id=p_workspace_id AND id=(p_payload->>'draftId')::uuid AND feature_kind='wardrobe' AND status='active' AND revision=(p_payload->>'draftRevision')::integer FOR UPDATE;
    IF NOT FOUND OR d.asset_id IS NULL OR d.payload->'saved'<>'{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='WARDROBE_DRAFT_CONFLICT'; END IF;
    PERFORM 1 FROM public.assets WHERE workspace_id=p_workspace_id AND id=d.asset_id AND bucket='wardrobe' AND status='ready' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='WARDROBE_ASSET_NOT_FOUND'; END IF;
    UPDATE public.wardrobe_items SET asset_id=d.asset_id,revision=revision+1 WHERE workspace_id=p_workspace_id AND id=w.id RETURNING * INTO w;
    UPDATE public.workflow_drafts SET status='completed',revision=revision+1 WHERE workspace_id=p_workspace_id AND id=d.id;
  ELSE RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WARDROBE_ACTION_INVALID'; END IF;
  RETURN w;
END; $$;

CREATE OR REPLACE FUNCTION public.reserve_wardrobe_provider_call(p_workspace_id uuid,p_operation_id uuid,p_attempt integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE op public.workflow_operations; used_calls integer; active_calls integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text||':create-provider-budget',0));
  SELECT * INTO op FROM public.workflow_operations WHERE workspace_id=p_workspace_id AND id=p_operation_id FOR UPDATE;
  IF NOT FOUND OR op.kind<>'wardrobe_description' OR op.status NOT IN ('running','partial') OR op.attempt_count<>p_attempt OR op.lease_until<=clock_timestamp() OR op.cancel_requested_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='WARDROBE_OPERATION_STALE'; END IF;
  IF public.stylora_subject_revision(p_workspace_id,'draft',op.subject_id)<>op.input_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='WARDROBE_INPUT_STALE'; END IF;
  SELECT coalesce(sum(provider_call_count),0),coalesce(sum(provider_inflight) FILTER(WHERE status IN ('running','partial') AND lease_until>clock_timestamp()),0) INTO used_calls,active_calls FROM public.workflow_operations WHERE workspace_id=p_workspace_id;
  IF used_calls>=150 OR op.provider_call_count>=3 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='PROVIDER_BUDGET_EXHAUSTED'; END IF;
  IF active_calls>=3 THEN RAISE EXCEPTION USING ERRCODE='55P03',MESSAGE='PROVIDER_CAPACITY_BUSY'; END IF;
  UPDATE public.workflow_operations SET provider_call_count=provider_call_count+1,provider_inflight=provider_inflight+1 WHERE workspace_id=p_workspace_id AND id=op.id;
END; $$;

CREATE OR REPLACE FUNCTION public.finish_wardrobe_description(p_workspace_id uuid,p_operation_id uuid,p_attempt integer,p_fingerprint text,p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE op public.workflow_operations; d public.workflow_drafts;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text,417));
  SELECT * INTO op FROM public.workflow_operations WHERE workspace_id=p_workspace_id AND id=p_operation_id AND kind='wardrobe_description' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='WARDROBE_OPERATION_NOT_FOUND'; END IF;
  IF op.attempt_count IS DISTINCT FROM p_attempt OR op.input_fingerprint IS DISTINCT FROM p_fingerprint OR op.status NOT IN ('running','partial') OR op.lease_until<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='WARDROBE_OPERATION_STALE'; END IF;
  SELECT * INTO d FROM public.workflow_drafts WHERE workspace_id=p_workspace_id AND id=op.subject_id AND feature_kind='wardrobe' FOR UPDATE;
  IF NOT FOUND OR d.status<>'active' OR d.revision<>op.input_revision OR d.asset_id::text IS DISTINCT FROM op.input->>'assetId' OR op.cancel_requested_at IS NOT NULL THEN
    UPDATE public.workflow_operations SET status='superseded',completed_at=clock_timestamp(),lease_until=NULL,provider_inflight=0 WHERE workspace_id=p_workspace_id AND id=op.id;
    RETURN;
  END IF;
  IF jsonb_typeof(p_payload->'proposals')<>'array' OR jsonb_array_length(p_payload->'proposals') NOT BETWEEN 1 AND 24 OR p_payload->>'mode'<>'live' OR p_payload->'saved'<>'{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WARDROBE_RESULT_INVALID'; END IF;
  UPDATE public.workflow_drafts SET payload=p_payload,current_step='review',revision=revision+1 WHERE workspace_id=p_workspace_id AND id=d.id;
  UPDATE public.workflow_operations SET status='succeeded',completed_at=clock_timestamp(),lease_until=NULL,provider_inflight=0,result_ref=jsonb_build_object('draftId',d.id),safe_error_code=NULL WHERE workspace_id=p_workspace_id AND id=op.id;
  PERFORM public.stylora_record_operation_event(p_workspace_id,op.id,'completed',jsonb_build_object('draftId',d.id));
END; $$;

CREATE FUNCTION public.append_wardrobe_piece(p_workspace_id uuid,p_operation_id uuid,p_attempt integer,p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE op public.workflow_operations;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text,417));
  SELECT * INTO op FROM public.workflow_operations WHERE workspace_id=p_workspace_id AND id=p_operation_id AND kind='wardrobe_description' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='WARDROBE_OPERATION_NOT_FOUND'; END IF;
  IF op.attempt_count IS DISTINCT FROM p_attempt OR op.status NOT IN ('running','partial') OR op.lease_until<=clock_timestamp() OR op.cancel_requested_at IS NOT NULL OR public.stylora_subject_revision(p_workspace_id,'draft',op.subject_id)<>op.input_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='WARDROBE_OPERATION_STALE'; END IF;
  PERFORM public.stylora_record_operation_event(p_workspace_id,op.id,'piece_completed',p_payload);
  UPDATE public.workflow_operations SET status='partial' WHERE workspace_id=p_workspace_id AND id=op.id;
END; $$;
REVOKE ALL ON FUNCTION public.append_wardrobe_piece(uuid,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.append_wardrobe_piece(uuid,uuid,integer,jsonb) TO service_role;
