ALTER TABLE public.wardrobe_matches ADD COLUMN explanation jsonb NOT NULL DEFAULT '{}', ADD COLUMN input_metadata jsonb NOT NULL DEFAULT '{}', ADD COLUMN is_current boolean NOT NULL DEFAULT true;
ALTER TABLE public.look_reviews ADD COLUMN is_current boolean NOT NULL DEFAULT true;
ALTER TABLE public.look_reviews ADD COLUMN input_metadata jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.outfit_options ADD COLUMN is_current boolean NOT NULL DEFAULT true;
ALTER TABLE public.outfit_options DROP CONSTRAINT outfit_options_workspace_id_look_id_option_type_key;
CREATE UNIQUE INDEX outfit_options_current_type ON public.outfit_options(workspace_id,look_id,option_type) WHERE is_current;
ALTER TABLE public.workflow_operations ADD COLUMN provider_call_count integer NOT NULL DEFAULT 0 CHECK(provider_call_count BETWEEN 0 AND 3), ADD COLUMN provider_inflight integer NOT NULL DEFAULT 0 CHECK(provider_inflight BETWEEN 0 AND 3);

CREATE OR REPLACE FUNCTION public.stylora_require_owned_item() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='wardrobe_matches' AND (to_jsonb(NEW)->>'is_current')::boolean=false THEN RETURN NEW; END IF;
 IF NEW.wardrobe_item_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.wardrobe_items w WHERE w.workspace_id=NEW.workspace_id AND w.id=NEW.wardrobe_item_id AND w.inventory_status='owned' AND w.archived_at IS NULL) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='STYLORA_OWNED_ITEM_REQUIRED'; END IF;
 RETURN NEW;
END; $$;

CREATE FUNCTION public.reserve_create_provider_call(p_workspace_id uuid,p_operation_id uuid,p_attempt integer) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE op public.workflow_operations; used_calls integer; active_calls integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':create-provider-budget',0));
 SELECT * INTO op FROM public.workflow_operations WHERE workspace_id=p_workspace_id AND id=p_operation_id FOR UPDATE;
 IF NOT FOUND OR op.kind NOT IN ('inspiration_description','inspiration_confidence','wardrobe_match','outfit_options','option_regeneration') OR op.status NOT IN ('running','partial') OR op.attempt_count<>p_attempt OR op.lease_until<clock_timestamp() OR op.cancel_requested_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='OPERATION_STALE'; END IF;
 SELECT coalesce(sum(provider_call_count),0),coalesce(sum(provider_inflight) FILTER(WHERE status IN ('running','partial') AND lease_until>clock_timestamp()),0) INTO used_calls,active_calls FROM public.workflow_operations WHERE workspace_id=p_workspace_id;
 IF used_calls>=150 OR op.provider_call_count>=3 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='PROVIDER_BUDGET_EXHAUSTED'; END IF;
 IF active_calls>=3 THEN RAISE EXCEPTION USING ERRCODE='55P03',MESSAGE='PROVIDER_CAPACITY_BUSY'; END IF;
 UPDATE public.workflow_operations SET provider_call_count=provider_call_count+1,provider_inflight=provider_inflight+1 WHERE workspace_id=p_workspace_id AND id=p_operation_id;
END; $$;
CREATE FUNCTION public.release_create_provider_call(p_workspace_id uuid,p_operation_id uuid,p_attempt integer) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 UPDATE public.workflow_operations SET provider_inflight=greatest(provider_inflight-1,0) WHERE workspace_id=p_workspace_id AND id=p_operation_id AND attempt_count=p_attempt;
$$;

CREATE FUNCTION public.attach_inspiration_upload(p_workspace_id uuid,p_asset_id uuid,p_draft_id uuid,p_expected_revision integer,p_occasion text DEFAULT NULL)
RETURNS public.looks LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.workflow_drafts; a public.assets; l public.looks;
BEGIN
 SELECT * INTO d FROM public.workflow_drafts WHERE workspace_id=p_workspace_id AND id=p_draft_id AND feature_kind='inspiration' AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='DRAFT_NOT_FOUND'; END IF;
 IF d.revision<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT'; END IF;
 SELECT * INTO a FROM public.assets WHERE workspace_id=p_workspace_id AND id=p_asset_id AND bucket='inspiration' AND status IN ('pending','ready') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='ASSET_NOT_FOUND'; END IF;
 IF p_occasion IS NOT NULL AND length(p_occasion)>120 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='OCCASION_INVALID'; END IF;
 UPDATE public.assets SET status='ready' WHERE workspace_id=p_workspace_id AND id=p_asset_id;
 IF d.look_id IS NULL THEN
  INSERT INTO public.looks(workspace_id,title,occasion,inspiration_asset_id,source_type) VALUES(p_workspace_id,'Inspiration outfit',p_occasion,p_asset_id,'live') RETURNING * INTO l;
 ELSE
  UPDATE public.looks SET inspiration_asset_id=p_asset_id,occasion=p_occasion,revision=revision+1,status='draft' WHERE workspace_id=p_workspace_id AND id=d.look_id RETURNING * INTO l;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='LOOK_NOT_FOUND'; END IF;
  UPDATE public.inspiration_pieces SET removed_at=clock_timestamp() WHERE workspace_id=p_workspace_id AND look_id=l.id AND removed_at IS NULL;
  UPDATE public.look_reviews SET is_current=false WHERE workspace_id=p_workspace_id AND look_id=l.id;
  UPDATE public.wardrobe_matches SET is_current=false WHERE workspace_id=p_workspace_id AND look_id=l.id;
  UPDATE public.outfit_options SET is_current=false WHERE workspace_id=p_workspace_id AND look_id=l.id;
 END IF;
 UPDATE public.workflow_drafts SET look_id=l.id,asset_id=p_asset_id,payload=jsonb_build_object('occasion',coalesce(p_occasion,'')),revision=revision+1 WHERE workspace_id=p_workspace_id AND id=p_draft_id;
 RETURN l;
END; $$;

CREATE FUNCTION public.save_inspiration_pieces(p_workspace_id uuid,p_look_id uuid,p_expected_revision integer,p_pieces jsonb)
RETURNS public.looks LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE l public.looks; item jsonb; item_id uuid; ids uuid[] := '{}';
BEGIN
 SELECT * INTO l FROM public.looks WHERE workspace_id=p_workspace_id AND id=p_look_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='LOOK_NOT_FOUND'; END IF;
 IF l.revision<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_CONFLICT'; END IF;
 IF jsonb_typeof(p_pieces)<>'array' OR jsonb_array_length(p_pieces)>24 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PIECES_INVALID'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_pieces) LOOP
  item_id := coalesce((item->>'id')::uuid,gen_random_uuid());
  IF item_id=ANY(ids) OR EXISTS(SELECT 1 FROM public.inspiration_pieces WHERE id=item_id AND (workspace_id<>p_workspace_id OR look_id<>p_look_id)) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='PIECE_PARENT_INVALID'; END IF;
  ids := array_append(ids,item_id);
  INSERT INTO public.inspiration_pieces(id,workspace_id,look_id,name,category,subcategory,description,attributes,provenance,corrections,uncertainty,confidence,source_type,position,image_context)
  VALUES(item_id,p_workspace_id,p_look_id,item->>'name',item->>'category',item->>'subcategory',coalesce(item->>'description',''),coalesce(item->'attributes','{}'),coalesce(item->'provenance','{}'),coalesce(item->'corrections','{}'),coalesce(item->'uncertainty','[]'),(item->>'confidence')::numeric,coalesce(item->>'source_type','manual'),coalesce((item->>'position')::integer,0),coalesce(item->'image_context','{}'))
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,subcategory=excluded.subcategory,description=excluded.description,attributes=excluded.attributes,provenance=excluded.provenance,corrections=excluded.corrections,uncertainty=excluded.uncertainty,confidence=excluded.confidence,source_type=excluded.source_type,position=excluded.position,revision=public.inspiration_pieces.revision+1,removed_at=NULL;
 END LOOP;
 UPDATE public.inspiration_pieces SET removed_at=clock_timestamp() WHERE workspace_id=p_workspace_id AND look_id=p_look_id AND NOT(id=ANY(ids)) AND removed_at IS NULL;
 UPDATE public.wardrobe_matches SET is_current=false WHERE workspace_id=p_workspace_id AND look_id=p_look_id;
 UPDATE public.outfit_options SET is_current=false WHERE workspace_id=p_workspace_id AND look_id=p_look_id;
 UPDATE public.looks SET revision=revision+1,status='reviewed' WHERE workspace_id=p_workspace_id AND id=p_look_id RETURNING * INTO l;
 RETURN l;
END; $$;

CREATE FUNCTION public.append_create_event(p_workspace_id uuid,p_operation_id uuid,p_attempt integer,p_type text,p_payload jsonb DEFAULT '{}')
RETURNS public.workflow_operation_events LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE op public.workflow_operations; ev public.workflow_operation_events; seq bigint;
BEGIN
 SELECT * INTO op FROM public.workflow_operations WHERE workspace_id=p_workspace_id AND id=p_operation_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='OPERATION_NOT_FOUND'; END IF;
 IF op.attempt_count<>p_attempt OR op.status NOT IN ('running','partial') OR op.lease_until<clock_timestamp() OR op.cancel_requested_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='OPERATION_STALE'; END IF;
 SELECT coalesce(max(sequence),0)+1 INTO seq FROM public.workflow_operation_events WHERE workspace_id=p_workspace_id AND operation_id=p_operation_id;
 INSERT INTO public.workflow_operation_events(workspace_id,operation_id,sequence,source_revision,event_type,payload) VALUES(p_workspace_id,p_operation_id,seq,op.input_revision,p_type,p_payload) RETURNING * INTO ev;
 RETURN ev;
END; $$;

CREATE FUNCTION public.finish_create_operation(p_workspace_id uuid,p_operation_id uuid,p_attempt integer,p_result jsonb,p_metadata jsonb)
RETURNS public.workflow_operations LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE op public.workflow_operations; l public.looks; item jsonb; opt jsonb; slot jsonb; option_id uuid; current_preferences jsonb; inventory_state jsonb; seq bigint; v_look_id uuid; stale boolean:=false;
BEGIN
 SELECT * INTO op FROM public.workflow_operations WHERE workspace_id=p_workspace_id AND id=p_operation_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='OPERATION_NOT_FOUND'; END IF;
 IF op.attempt_count<>p_attempt OR op.status NOT IN ('running','partial') OR op.lease_until<clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='OPERATION_STALE'; END IF;
 v_look_id := (op.input->>'lookId')::uuid;
 SELECT * INTO l FROM public.looks WHERE workspace_id=p_workspace_id AND id=v_look_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='LOOK_NOT_FOUND'; END IF;
 stale := l.revision<>(op.input->>'lookRevision')::integer OR op.cancel_requested_at IS NOT NULL;
 IF op.input ? 'preferenceData' THEN
  SELECT jsonb_build_object('styleDna',style_dna,'fitPreferences',fit_preferences,'bodyProfile',body_profile) INTO current_preferences FROM public.user_preferences WHERE workspace_id=p_workspace_id FOR SHARE;
  stale := stale OR current_preferences IS DISTINCT FROM op.input->'preferenceData';
 END IF;
 IF op.input ? 'inventoryState' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision) ORDER BY id),'[]') INTO inventory_state FROM public.wardrobe_items WHERE workspace_id=p_workspace_id AND inventory_status='owned' AND archived_at IS NULL AND ((op.input->>'inventoryMode'='sample' AND source_type='sample') OR (op.input->>'inventoryMode'='live' AND source_type<>'sample'));
  stale := stale OR inventory_state IS DISTINCT FROM op.input->'inventoryState';
 END IF;
 IF op.kind='option_regeneration' THEN
  PERFORM 1 FROM public.outfit_options WHERE workspace_id=p_workspace_id AND look_id=v_look_id AND id=op.subject_id AND revision=op.input_revision AND is_current FOR UPDATE;
  stale := stale OR NOT FOUND;
 END IF;
 IF stale THEN
  UPDATE public.workflow_operations SET status=CASE WHEN cancel_requested_at IS NULL THEN 'superseded' ELSE 'cancelled' END,lease_until=NULL,completed_at=clock_timestamp(),safe_error_code='INPUT_SUPERSEDED' WHERE workspace_id=p_workspace_id AND id=op.id RETURNING * INTO op;
 ELSE
  IF op.kind='inspiration_description' THEN
   UPDATE public.inspiration_pieces SET removed_at=clock_timestamp() WHERE workspace_id=p_workspace_id AND look_id=l.id AND removed_at IS NULL;
   UPDATE public.wardrobe_matches SET is_current=false WHERE workspace_id=p_workspace_id AND look_id=l.id;
   UPDATE public.outfit_options SET is_current=false WHERE workspace_id=p_workspace_id AND look_id=l.id;
   FOR item IN SELECT value FROM jsonb_array_elements(p_result->'pieces') LOOP
    INSERT INTO public.inspiration_pieces(id,workspace_id,look_id,name,category,subcategory,description,attributes,provenance,uncertainty,confidence,source_type,position)
    VALUES((item->>'id')::uuid,p_workspace_id,l.id,item->>'name',item->>'category',item->>'subcategory',item->>'description',item->'attributes',item->'provenance',item->'uncertainty',(item->>'confidence')::numeric,'live',(item->>'position')::integer);
   END LOOP;
   UPDATE public.looks SET status=CASE WHEN status='draft' THEN 'analyzed' ELSE status END,provider_metadata=provider_metadata || jsonb_build_object('description',p_metadata) WHERE workspace_id=p_workspace_id AND id=l.id;
  ELSIF op.kind='inspiration_confidence' THEN
   UPDATE public.look_reviews SET is_current=false WHERE workspace_id=p_workspace_id AND look_id=l.id;
   INSERT INTO public.look_reviews(workspace_id,look_id,source_revision,preference_revision,explanation,inputs_used,uncertainty,input_metadata) VALUES(p_workspace_id,l.id,l.revision,NULL,p_result,jsonb_build_object('keys',p_result->'explanation'->'inputsUsed'),coalesce(p_result->'explanation'->'uncertainty','[]'),p_metadata);
  ELSIF op.kind='wardrobe_match' THEN
   UPDATE public.wardrobe_matches SET is_current=false WHERE workspace_id=p_workspace_id AND look_id=l.id;
   FOR item IN SELECT value FROM jsonb_array_elements(p_result->'matches') LOOP
    INSERT INTO public.wardrobe_matches(workspace_id,look_id,piece_id,wardrobe_item_id,match_type,rationale,shared_attributes,differences,rejected_candidates,evidence_coverage,confidence,source_revision,source_type,explanation,input_metadata)
    VALUES(p_workspace_id,l.id,(item->>'pieceId')::uuid,(item->>'wardrobeItemId')::uuid,item->>'outcome',item->'explanation'->>'summary',jsonb_build_object('values',item->'sharedAttributes'),jsonb_build_object('values',item->'differences'),item->'rejectedCandidates',(item->>'evidenceCoverage')::numeric,(item->>'score')::numeric,l.revision,item->>'sourceType',item->'explanation',p_metadata);
   END LOOP;
   UPDATE public.looks SET status='matched' WHERE workspace_id=p_workspace_id AND id=l.id;
  ELSIF op.kind IN ('outfit_options','option_regeneration') THEN
   FOR opt IN SELECT value FROM jsonb_array_elements(p_result->'options') LOOP
    UPDATE public.outfit_options SET is_current=false,status='unavailable' WHERE workspace_id=p_workspace_id AND look_id=l.id AND option_type=opt->>'optionType' AND is_current;
    INSERT INTO public.outfit_options(workspace_id,look_id,option_type,title,concept,rationale,explanation,inputs_used,uncertainty,status,source_revision,provider_metadata,source_type)
    VALUES(p_workspace_id,l.id,opt->>'optionType',opt->>'title',opt->>'concept',opt->'explanation'->>'summary',opt->'explanation',jsonb_build_object('keys',opt->'explanation'->'inputsUsed'),opt->'explanation'->'uncertainty',opt->>'status',l.revision,p_metadata,coalesce(opt->>'sourceType','live')) RETURNING id INTO option_id;
    FOR slot IN SELECT value FROM jsonb_array_elements(opt->'items') LOOP
     INSERT INTO public.outfit_option_items(workspace_id,look_id,option_id,slot_id,category,item_kind,piece_id,wardrobe_item_id,missing_brief,rationale,position)
     VALUES(p_workspace_id,l.id,option_id,slot->>'slotId',slot->>'category',slot->>'itemKind',(slot->>'pieceId')::uuid,(slot->>'wardrobeItemId')::uuid,nullif(slot->'missingBrief','null'::jsonb),slot->>'rationale',coalesce((slot->>'position')::integer,0));
    END LOOP;
   END LOOP;
   UPDATE public.looks SET status='options_ready' WHERE workspace_id=p_workspace_id AND id=l.id;
  ELSE RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='OPERATION_KIND_INVALID'; END IF;
  UPDATE public.workflow_operations SET status='succeeded',lease_until=NULL,completed_at=clock_timestamp(),provider_request_id=p_metadata->>'requestId',result_ref=jsonb_build_object('lookId',l.id,'sourceRevision',l.revision,'metadata',p_metadata) WHERE workspace_id=p_workspace_id AND id=op.id RETURNING * INTO op;
 END IF;
 SELECT coalesce(max(sequence),0)+1 INTO seq FROM public.workflow_operation_events WHERE workspace_id=p_workspace_id AND operation_id=op.id;
 INSERT INTO public.workflow_operation_events(workspace_id,operation_id,sequence,source_revision,event_type,payload) VALUES(p_workspace_id,op.id,seq,op.input_revision,CASE WHEN op.status='succeeded' THEN 'completed' ELSE op.status END,coalesce(op.result_ref,'{}'));
 RETURN op;
END; $$;

REVOKE ALL ON FUNCTION public.attach_inspiration_upload(uuid,uuid,uuid,integer,text),public.save_inspiration_pieces(uuid,uuid,integer,jsonb),public.append_create_event(uuid,uuid,integer,text,jsonb),public.finish_create_operation(uuid,uuid,integer,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.attach_inspiration_upload(uuid,uuid,uuid,integer,text),public.save_inspiration_pieces(uuid,uuid,integer,jsonb),public.append_create_event(uuid,uuid,integer,text,jsonb),public.finish_create_operation(uuid,uuid,integer,jsonb,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.reserve_create_provider_call(uuid,uuid,integer),public.release_create_provider_call(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_create_provider_call(uuid,uuid,integer),public.release_create_provider_call(uuid,uuid,integer) TO service_role;
