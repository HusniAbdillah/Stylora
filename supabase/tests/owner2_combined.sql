BEGIN;
SET LOCAL ROLE service_role;

DO $$
DECLARE
  ws uuid := gen_random_uuid(); foreign_ws uuid := gen_random_uuid();
  test_look uuid := gen_random_uuid(); test_piece uuid := gen_random_uuid();
  active_owned uuid := gen_random_uuid(); sample_owned uuid := gen_random_uuid();
  archived_owned uuid := gen_random_uuid(); candidate uuid := gen_random_uuid();
  foreign_item uuid := gen_random_uuid(); combined_option uuid := gen_random_uuid();
  live_option uuid := gen_random_uuid();
  inventory_snapshot jsonb; op public.workflow_operations; finished public.workflow_operations;
  object_row record;
BEGIN
  FOR object_row IN SELECT oid, relname, relrowsecurity FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relname IN
      ('wardrobe_items','inspiration_pieces','wardrobe_matches','outfit_options',
       'outfit_option_items','workflow_operations','workflow_operation_events')
  LOOP
    IF NOT object_row.relrowsecurity
      OR has_table_privilege('anon',object_row.oid,'SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege('authenticated',object_row.oid,'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'Internal Create table access is exposed: %',object_row.relname;
    END IF;
  END LOOP;
  IF has_function_privilege('anon','public.finish_create_operation(uuid,uuid,integer,jsonb,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.finish_create_operation(uuid,uuid,integer,jsonb,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Combined completion RPC is publicly executable';
  END IF;

  INSERT INTO public.workspaces(id,name) VALUES
    (ws,'__owner2_combined_'||ws),(foreign_ws,'__owner2_combined_foreign_'||foreign_ws);
  INSERT INTO public.looks(id,workspace_id,title,occasion)
    VALUES(test_look,ws,'Synthetic combined SQL fixture','Work');
  INSERT INTO public.inspiration_pieces(id,workspace_id,look_id,name,category)
    VALUES(test_piece,ws,test_look,'Synthetic comparison top','top');
  INSERT INTO public.wardrobe_items(id,workspace_id,name,category,source_type,inventory_status,archived_at) VALUES
    (active_owned,ws,'Synthetic manual owned top','top','manual','owned',NULL),
    (sample_owned,ws,'Synthetic sample owned top','top','sample','owned',NULL),
    (archived_owned,ws,'Synthetic archived owned top','top','manual','owned',clock_timestamp()),
    (candidate,ws,'Synthetic saved candidate top','top','manual','saved_candidate',NULL),
    (foreign_item,foreign_ws,'Synthetic foreign owned top','top','manual','owned',NULL);
  SELECT jsonb_agg(jsonb_build_object('id',id,'revision',revision) ORDER BY id)
    INTO inventory_snapshot FROM public.wardrobe_items WHERE workspace_id=ws;
  IF jsonb_array_length(inventory_snapshot)<>4 THEN
    RAISE EXCEPTION 'Combined snapshot did not include all four scoped inventory states';
  END IF;

  op:=public.start_workflow_operation(ws,'wardrobe_match','look',test_look,1,repeat('a',64),
    jsonb_build_object('lookId',test_look,'lookRevision',1,'inventoryMode','combined','inventoryState',inventory_snapshot));
  op:=public.claim_workflow_operation(ws,op.id,1);
  BEGIN
    PERFORM public.finish_create_operation(foreign_ws,op.id,op.attempt_count,'{}','{}');
    RAISE EXCEPTION 'Foreign workspace completed a Create operation';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  finished:=public.finish_create_operation(ws,op.id,op.attempt_count,
    jsonb_build_object('matches',jsonb_build_array(jsonb_build_object(
      'pieceId',test_piece,'wardrobeItemId',candidate,'outcome','wardrobe_alternative',
      'sharedAttributes','[]'::jsonb,'differences','[]'::jsonb,'rejectedCandidates','[]'::jsonb,
      'evidenceCoverage',0.5,'score',0.5,'sourceType','manual',
      'explanation',jsonb_build_object('summary','Synthetic transaction fixture; a saved candidate is an alternative, never owned.')))),
    '{"inventoryMode":"combined"}'::jsonb);
  IF finished.status<>'succeeded' OR NOT EXISTS(
    SELECT 1 FROM public.wardrobe_matches m WHERE m.workspace_id=ws AND m.look_id=test_look
      AND m.wardrobe_item_id=candidate AND m.match_type='wardrobe_alternative' AND m.is_current
  ) THEN RAISE EXCEPTION 'Combined snapshot or candidate alternative completion was rejected'; END IF;
  BEGIN
    INSERT INTO public.wardrobe_matches(workspace_id,look_id,piece_id,wardrobe_item_id,match_type,rationale,source_revision,input_metadata)
      VALUES(ws,test_look,test_piece,candidate,'owned_match','Synthetic forbidden ownership fixture.',1,'{"inventoryMode":"combined"}');
    RAISE EXCEPTION 'Saved candidate was accepted as an owned match';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.wardrobe_matches(workspace_id,look_id,piece_id,wardrobe_item_id,match_type,rationale,source_revision,input_metadata)
      VALUES(ws,test_look,test_piece,foreign_item,'wardrobe_alternative','Synthetic foreign reference fixture.',1,'{"inventoryMode":"combined"}');
    RAISE EXCEPTION 'Foreign wardrobe reference was accepted';
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL; END;

  INSERT INTO public.outfit_options(id,workspace_id,look_id,option_type,title,source_revision,provider_metadata) VALUES
    (combined_option,ws,test_look,'from_wardrobe','Synthetic combined owned option',1,'{"inventoryMode":"combined"}'),
    (live_option,ws,test_look,'closest','Synthetic legacy live option',1,'{"inventoryMode":"live"}');
  INSERT INTO public.outfit_option_items(workspace_id,look_id,option_id,slot_id,category,item_kind,wardrobe_item_id,position) VALUES
    (ws,test_look,combined_option,'archived-top','top','owned',archived_owned,0),
    (ws,test_look,combined_option,'sample-top','top','owned',sample_owned,1);
  IF(SELECT count(*) FROM public.outfit_option_items i WHERE i.workspace_id=ws AND i.option_id=combined_option)<>2 THEN
    RAISE EXCEPTION 'Combined wardrobe option rejected archived or sample owned rows';
  END IF;
  BEGIN
    INSERT INTO public.outfit_option_items(workspace_id,look_id,option_id,slot_id,category,item_kind,wardrobe_item_id)
      VALUES(ws,test_look,combined_option,'candidate-top','top','owned',candidate);
    RAISE EXCEPTION 'Saved candidate was accepted as an owned outfit slot';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.outfit_option_items(workspace_id,look_id,option_id,slot_id,category,item_kind,wardrobe_item_id)
      VALUES(ws,test_look,combined_option,'foreign-top','top','owned',foreign_item);
    RAISE EXCEPTION 'Foreign wardrobe item was accepted into a combined outfit';
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.outfit_option_items(workspace_id,look_id,option_id,slot_id,category,item_kind,wardrobe_item_id)
      VALUES(ws,test_look,live_option,'archived-top','top','owned',archived_owned);
    RAISE EXCEPTION 'Combined mode weakened legacy live archive eligibility';
  EXCEPTION WHEN check_violation THEN NULL; END;

  op:=public.start_workflow_operation(ws,'wardrobe_match','look',test_look,1,repeat('b',64),
    jsonb_build_object('lookId',test_look,'lookRevision',1,'inventoryMode','combined','inventoryState',inventory_snapshot));
  op:=public.claim_workflow_operation(ws,op.id,1);
  UPDATE public.wardrobe_items SET revision=revision+1 WHERE workspace_id=ws AND id=candidate;
  finished:=public.finish_create_operation(ws,op.id,op.attempt_count,'{"matches":[]}','{"inventoryMode":"combined"}');
  IF finished.status<>'superseded' THEN
    RAISE EXCEPTION 'Changed saved candidate did not fence the combined snapshot';
  END IF;
END; $$;

SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM 1 FROM public.wardrobe_matches LIMIT 1; RAISE EXCEPTION 'Anon read internal matches';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.workflow_operations DEFAULT VALUES; RAISE EXCEPTION 'Anon inserted an internal operation';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM 1 FROM public.outfit_option_items LIMIT 1; RAISE EXCEPTION 'Authenticated read internal outfit items';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.workflow_operations DEFAULT VALUES; RAISE EXCEPTION 'Authenticated inserted an internal operation';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
RESET ROLE;
ROLLBACK;
SELECT 'Combined snapshot, candidate distinction, archived owned slots, stale fencing and scoped access checks passed; fixtures rolled back' AS result;
