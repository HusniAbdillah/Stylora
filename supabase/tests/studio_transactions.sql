BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  ws uuid := gen_random_uuid(); foreign_ws uuid := gen_random_uuid(); capsule uuid := gen_random_uuid();
  t1 uuid := gen_random_uuid(); t2 uuid := gen_random_uuid(); t3 uuid := gen_random_uuid();
  bottom uuid := gen_random_uuid(); shoes uuid := gen_random_uuid(); candidate uuid := gen_random_uuid();
  outfit1 uuid := gen_random_uuid(); outfit2 uuid := gen_random_uuid(); outfit3 uuid := gen_random_uuid();
  draft uuid := gen_random_uuid(); capsule_draft uuid := gen_random_uuid(); image uuid := gen_random_uuid();
  item_ids uuid[]; extra_ids uuid[]; brief jsonb; outfits jsonb; oversized_outfits jsonb; additions jsonb; current_draft jsonb;
  op public.workflow_operations; queued_op public.workflow_operations; saved jsonb; preview_saved jsonb; second_saved jsonb;
BEGIN
  INSERT INTO public.workspaces(id,name) VALUES (ws,'studio_test_' || ws),(foreign_ws,'studio_test_' || foreign_ws);
  INSERT INTO public.wardrobe_items(id,workspace_id,name,category,inventory_status,source_type) VALUES
    (t1,ws,'Synthetic top one','top','owned','sample'),(t2,ws,'Synthetic top two','top','owned','sample'),
    (t3,ws,'Synthetic top three','top','owned','sample'),(bottom,ws,'Synthetic trousers','bottom','owned','sample'),
    (shoes,ws,'Synthetic shoes','shoes','owned','sample'),(candidate,ws,'Synthetic candidate','top','saved_candidate','sample');
  item_ids := ARRAY[t1,t2,t3,bottom,shoes];
  SELECT array_agg(gen_random_uuid()) INTO extra_ids FROM generate_series(1,15);
  INSERT INTO public.wardrobe_items(id,workspace_id,name,category,inventory_status,source_type)
    SELECT id,ws,'Synthetic accessory','accessory','owned','sample' FROM unnest(extra_ids) id;
  item_ids := item_ids || extra_ids;
  brief := jsonb_build_object('targetOutfits',3,'includedItemIds',to_jsonb(item_ids),'requiredItemIds',jsonb_build_array(t1),'excludedItemIds','[]'::jsonb);
  current_draft := public.save_capsule_draft(ws,capsule,0,'Synthetic capsule',brief,item_ids);
  IF current_draft ->> 'revision' <> '1' THEN RAISE EXCEPTION 'Draft creation failed'; END IF;
  IF public.save_capsule_draft(ws,capsule,0,'Synthetic capsule',brief,item_ids) <> current_draft THEN
    RAISE EXCEPTION 'Draft retry was not idempotent';
  END IF;
  BEGIN
    PERFORM public.save_capsule_draft(foreign_ws,capsule,1,'Foreign edit',brief,item_ids);
    RAISE EXCEPTION 'Foreign capsule edit accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  op := public.start_workflow_operation(ws,'capsule_generation','capsule',capsule,1,repeat('a',64),
    jsonb_build_object('brief',brief,'itemRevisions',(SELECT jsonb_object_agg(id::text,1) FROM unnest(item_ids) id),'preferenceRevision',0));
  op := public.claim_workflow_operation(ws,op.id,1);
  SELECT jsonb_agg(jsonb_build_object('id',id,'title','Synthetic composition','rationale','Synthetic reasoning',
    'explanation','{}'::jsonb,'inputs_used','{}'::jsonb,'uncertainty','[]'::jsonb,
    'proposed_slots','[]'::jsonb,'wardrobe_item_ids',jsonb_build_array(top,bottom,shoes))) INTO outfits
    FROM (VALUES (outfit1,t1),(outfit2,t2),(outfit3,t3)) AS source(id,top);
  additions := jsonb_build_array(jsonb_build_object('key','extra','brief',jsonb_build_object(
    'schemaVersion','fashion-item.v1','name','Synthetic missing accessory','category','accessory','inventoryStatus','not_applicable'),
    'supportingItemIds',jsonb_build_array(t1,t2,bottom),'unlockedOutfitIds',jsonb_build_array(outfit1,outfit2)));
  oversized_outfits := jsonb_set(jsonb_set(outfits,'{0,wardrobe_item_ids}',to_jsonb(item_ids)),'{0,proposed_slots}',
    jsonb_build_array(jsonb_build_object('additionKey','extra','brief',additions -> 0 -> 'brief')));
  BEGIN
    PERFORM public.commit_capsule_generation(ws,op.id,1,repeat('a',64),capsule,1,oversized_outfits,additions);
    RAISE EXCEPTION 'Snapshot composition larger than twenty items accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'STYLORA_CAPSULE_COMPOSITION_INVALID' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.commit_capsule_generation(ws,op.id,0,repeat('a',64),capsule,1,outfits,'[]');
    RAISE EXCEPTION 'Stale generation attempt accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  BEGIN
    UPDATE public.wardrobe_items SET revision = 2 WHERE workspace_id = ws AND id = t1;
    PERFORM public.commit_capsule_generation(ws,op.id,1,repeat('a',64),capsule,1,outfits,'[]');
    RAISE EXCEPTION 'Changed wardrobe revision accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  BEGIN
    INSERT INTO public.user_preferences(workspace_id) VALUES (ws);
    PERFORM public.commit_capsule_generation(ws,op.id,1,repeat('a',64),capsule,1,outfits,'[]');
    RAISE EXCEPTION 'Changed preference revision accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  SELECT jsonb_agg(CASE WHEN x ->> 'id' IN (outfit1::text,outfit2::text)
    THEN jsonb_set(x,'{proposed_slots}',jsonb_build_array(jsonb_build_object('additionKey','extra','brief',additions -> 0 -> 'brief')))
    ELSE x END ORDER BY n) INTO outfits FROM jsonb_array_elements(outfits) WITH ORDINALITY AS source(x,n);
  op := public.commit_capsule_generation(ws,op.id,1,repeat('a',64),capsule,1,outfits,additions);
  IF op.status <> 'succeeded' OR (SELECT count(*) FROM public.capsule_outfits WHERE workspace_id = ws AND capsule_id = capsule) <> 3
    OR (SELECT count(*) FROM public.capsule_outfit_items WHERE workspace_id = ws AND capsule_id = capsule) <> 9 THEN
    RAISE EXCEPTION 'Generation was not atomic';
  END IF;
  saved := public.save_studio_look(ws,'capsule',outfit1,capsule,1,'capsule-save','Synthetic saved capsule');
  IF saved <> public.save_studio_look(ws,'capsule',outfit1,capsule,1,'capsule-save','Synthetic saved capsule') THEN
    RAISE EXCEPTION 'Capsule save retry created another snapshot';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.saved_look_media WHERE workspace_id = ws AND saved_look_id = (saved ->> 'savedLookId')::uuid
    AND operation_id = (saved ->> 'operationId')::uuid AND status = 'queued') THEN RAISE EXCEPTION 'Avatar outbox missing'; END IF;
  INSERT INTO public.workflow_drafts(id,workspace_id,feature_kind,payload)
    VALUES (draft,ws,'preview',jsonb_build_object('selection',jsonb_build_object('top',t1,'bottom',bottom,'shoes',shoes)));
  INSERT INTO public.assets(id,workspace_id,bucket,storage_path,mime_type,byte_size,status,source_type)
    VALUES (image,ws,'previews',ws::text || '/' || image || '.png','image/png',1,'ready','sample');
  op := public.start_workflow_operation(ws,'preview_image','draft',draft,1,repeat('c',64),
    jsonb_build_object('items',jsonb_build_array(jsonb_build_object('id',t1,'revision',1),
      jsonb_build_object('id',bottom,'revision',1),jsonb_build_object('id',shoes,'revision',1)),
      'preferences',jsonb_build_object('revision',0),'renderFingerprint',repeat('d',64)));
  op := public.claim_workflow_operation(ws,op.id,1);
  PERFORM public.complete_preview_operation(ws,op.id,1,repeat('c',64),image,repeat('d',64));
  preview_saved := public.save_studio_look(ws,'preview',draft,NULL,1,'preview-save','Synthetic saved preview');
  IF (SELECT source_kind FROM public.saved_look_snapshots WHERE workspace_id = ws AND id = (preview_saved ->> 'savedLookId')::uuid) <> 'preview' THEN
    RAISE EXCEPTION 'Preview snapshot source missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.saved_look_media WHERE workspace_id = ws
    AND saved_look_id = (preview_saved ->> 'savedLookId')::uuid AND output_asset_id = image AND status = 'succeeded') THEN
    RAISE EXCEPTION 'Matching preview asset was not reused';
  END IF;
  UPDATE public.workflow_drafts SET payload = jsonb_build_object('selection',jsonb_build_object('top',candidate)), revision = 2 WHERE workspace_id = ws AND id = draft;
  BEGIN
    PERFORM public.save_studio_look(ws,'preview',draft,NULL,2,'candidate-save','Synthetic invalid preview');
    RAISE EXCEPTION 'Saved candidate was treated as owned';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.workflow_drafts(id,workspace_id,feature_kind,capsule_id,payload)
    VALUES (capsule_draft,ws,'capsules',capsule,jsonb_build_object('brief',brief));
  PERFORM public.delete_capsule_outfit(ws,capsule,outfit2,1);
  IF (SELECT count(*) FROM public.capsule_outfits WHERE workspace_id = ws AND capsule_id = capsule) <> 2
    OR (SELECT revision FROM public.capsules WHERE workspace_id = ws AND id = capsule) <> 2
    OR EXISTS (SELECT 1 FROM public.capsule_outfits WHERE workspace_id = ws AND capsule_id = capsule AND source_revision <> 2) THEN
    RAISE EXCEPTION 'Outfit deletion affected siblings';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.capsules WHERE workspace_id = ws AND id = capsule
    AND missing_additions -> 0 -> 'unlockedOutfitIds' = jsonb_build_array(outfit1)
    AND missing_additions -> 0 -> 'supportingItemIds' = jsonb_build_array(t1,bottom)) THEN
    RAISE EXCEPTION 'Outfit deletion retained unsupported addition evidence';
  END IF;
  BEGIN
    PERFORM public.delete_capsule_outfit(ws,capsule,outfit2,1);
    RAISE EXCEPTION 'Stale repeat delete accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  second_saved := public.save_studio_look(ws,'capsule',outfit3,capsule,2,'remaining-save','Synthetic remaining outfit');
  PERFORM public.delete_capsule_outfit(ws,capsule,outfit1,2);
  PERFORM public.delete_capsule_outfit(ws,capsule,outfit3,3);
  IF EXISTS (SELECT 1 FROM public.capsule_outfits WHERE workspace_id = ws AND capsule_id = capsule)
    OR NOT EXISTS (SELECT 1 FROM public.workflow_operations WHERE workspace_id = ws AND subject_type = 'capsule'
      AND subject_id = capsule AND kind = 'capsule_generation' AND status = 'succeeded')
    OR NOT EXISTS (SELECT 1 FROM public.workflow_drafts WHERE workspace_id = ws AND id = capsule_draft
      AND status = 'completed' AND payload ->> 'capsuleRevision' = '4') THEN
    RAISE EXCEPTION 'Deleting all outfits lost completed generation marker';
  END IF;
  op := public.start_workflow_operation(ws,'capsule_generation','capsule',capsule,4,repeat('b',64));
  op := public.claim_workflow_operation(ws,op.id,4);
  current_draft := public.save_capsule_draft(ws,capsule,4,'Synthetic capsule',brief || '{"notes":"Changed"}',item_ids);
  IF current_draft ->> 'revision' <> '5' OR EXISTS (SELECT 1 FROM public.capsule_outfits WHERE workspace_id = ws AND capsule_id = capsule)
    OR NOT EXISTS (SELECT 1 FROM public.workflow_operations WHERE workspace_id = ws AND id = op.id
      AND status = 'running' AND cancel_requested_at IS NOT NULL AND lease_until > clock_timestamp()) THEN
    RAISE EXCEPTION 'Draft edit did not invalidate outputs and request cancellation';
  END IF;
  op := public.finish_workflow_operation(ws,op.id,1,repeat('b',64),'succeeded','{}');
  IF op.status <> 'cancelled' THEN RAISE EXCEPTION 'Worker did not acknowledge cancellation after revision changed'; END IF;
  op := public.start_workflow_operation(ws,'capsule_generation','capsule',capsule,5,repeat('e',64));
  op := public.claim_workflow_operation(ws,op.id,5);
  queued_op := public.start_workflow_operation(ws,'capsule_generation','capsule',capsule,5,repeat('f',64));
  PERFORM public.delete_capsule(ws,capsule,5);
  IF NOT EXISTS (SELECT 1 FROM public.workflow_operations WHERE workspace_id = ws AND id = queued_op.id AND status = 'cancelled')
    OR NOT EXISTS (SELECT 1 FROM public.workflow_operations WHERE workspace_id = ws AND id = op.id
      AND status = 'running' AND cancel_requested_at IS NOT NULL AND lease_until > clock_timestamp()) THEN
    RAISE EXCEPTION 'Delete did not preserve active lease and cancel queued work';
  END IF;
  op := public.finish_workflow_operation(ws,op.id,1,repeat('e',64),'succeeded','{}');
  IF op.status <> 'cancelled' THEN RAISE EXCEPTION 'Worker did not acknowledge cancellation after parent deletion'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.saved_look_snapshots WHERE workspace_id = ws AND id = (saved ->> 'savedLookId')::uuid) THEN
    RAISE EXCEPTION 'Source deletion removed saved snapshot';
  END IF;
  IF saved <> public.save_studio_look(ws,'capsule',outfit1,capsule,1,'capsule-save','Synthetic saved capsule') THEN
    RAISE EXCEPTION 'Save retry failed after source deletion';
  END IF;
  IF has_function_privilege('anon','public.save_studio_look(uuid,text,uuid,uuid,integer,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.commit_capsule_generation(uuid,uuid,integer,text,uuid,integer,jsonb,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Direct studio RPC access allowed';
  END IF;
END;
$$;
ROLLBACK;
