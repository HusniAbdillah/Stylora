-- Combined inventory is a Create comparison scope. Candidate rows never become owned outfit slots.
CREATE OR REPLACE FUNCTION public.stylora_require_owned_item() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='wardrobe_matches' THEN
  IF NOT NEW.is_current THEN RETURN NEW; END IF;
  IF NEW.input_metadata->>'inventoryMode'='combined' THEN
   IF NEW.wardrobe_item_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.wardrobe_items w WHERE w.workspace_id=NEW.workspace_id AND w.id=NEW.wardrobe_item_id AND (NEW.match_type<>'owned_match' OR w.inventory_status='owned')) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='STYLORA_MATCH_ITEM_INVALID';
   END IF;
   RETURN NEW;
  END IF;
 END IF;
 IF NEW.wardrobe_item_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.wardrobe_items w WHERE w.workspace_id=NEW.workspace_id AND w.id=NEW.wardrobe_item_id AND w.inventory_status='owned' AND w.archived_at IS NULL) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='STYLORA_OWNED_ITEM_REQUIRED';
 END IF;
 RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.stylora_guard_option_item() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_type text; v_combined boolean;
BEGIN
  SELECT o.option_type, coalesce(o.provider_metadata->>'inventoryMode'='combined',false) INTO v_type,v_combined FROM public.outfit_options o
    WHERE o.workspace_id = NEW.workspace_id AND o.look_id = NEW.look_id AND o.id = NEW.option_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'STYLORA_OPTION_PARENT_NOT_FOUND';
  END IF;
  IF v_type = 'from_wardrobe' AND NEW.item_kind <> 'owned' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OWNED_ONLY_OPTION';
  END IF;
  IF NEW.item_kind = 'owned' AND NOT EXISTS (
    SELECT 1 FROM public.wardrobe_items w WHERE w.workspace_id = NEW.workspace_id
      AND w.id = NEW.wardrobe_item_id AND w.inventory_status = 'owned' AND (v_combined OR w.archived_at IS NULL)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_OWNED_ITEM_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.outfit_option_items i WHERE i.workspace_id = NEW.workspace_id
    AND i.option_id = NEW.option_id AND i.slot_id = NEW.slot_id AND i.id <> NEW.id
    AND (i.category <> NEW.category OR i.position <> NEW.position)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STYLORA_SLOT_CONTRACT_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.finish_create_operation(p_workspace_id uuid,p_operation_id uuid,p_attempt integer,p_result jsonb,p_metadata jsonb)
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
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision) ORDER BY id),'[]') INTO inventory_state FROM public.wardrobe_items WHERE workspace_id=p_workspace_id AND (op.input->>'inventoryMode'='combined' OR (inventory_status='owned' AND archived_at IS NULL AND ((op.input->>'inventoryMode'='sample' AND source_type='sample') OR (op.input->>'inventoryMode'='live' AND source_type<>'sample'))));
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
