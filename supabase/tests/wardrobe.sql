BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
 ws uuid:=gen_random_uuid(); other_ws uuid:=gen_random_uuid(); draft uuid:=gen_random_uuid(); asset uuid:=gen_random_uuid(); proposal uuid:=gen_random_uuid(); second uuid:=gen_random_uuid();
 payload jsonb; result jsonb; repeated jsonb; op public.workflow_operations; object_row record;
BEGIN
 FOR object_row IN SELECT oid,relname,relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('wardrobe_items','workflow_drafts','assets') LOOP
  IF NOT object_row.relrowsecurity OR has_table_privilege('anon',object_row.oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated',object_row.oid,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Wardrobe direct access is not denied'; END IF;
 END LOOP;
 FOR object_row IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('wardrobe_draft_command','wardrobe_item_command','reserve_wardrobe_provider_call','finish_wardrobe_description','retry_wardrobe_description','append_wardrobe_piece') LOOP
  IF has_function_privilege('anon',object_row.oid,'EXECUTE') OR has_function_privilege('authenticated',object_row.oid,'EXECUTE') OR NOT has_function_privilege('service_role',object_row.oid,'EXECUTE') THEN RAISE EXCEPTION 'Wardrobe command grants are invalid'; END IF;
 END LOOP;
 INSERT INTO public.workspaces(id,name) VALUES(ws,'__wardrobe_check_'||ws),(other_ws,'__wardrobe_check_'||other_ws);
 INSERT INTO public.assets(id,workspace_id,bucket,storage_path,mime_type,byte_size,status) VALUES(asset,ws,'wardrobe',ws::text||'/'||asset::text||'/'||gen_random_uuid()::text||'.webp','image/webp',1,'ready');
 payload:=jsonb_build_object('version','wardrobe-draft.v1','mode','manual','proposals',jsonb_build_array(jsonb_build_object('id',proposal)), 'saved','{}'::jsonb,'metadata','{}'::jsonb);
 INSERT INTO public.workflow_drafts(id,workspace_id,feature_kind,asset_id,payload) VALUES(draft,ws,'wardrobe',asset,payload),(second,ws,'wardrobe',asset,payload);
 BEGIN
  PERFORM public.wardrobe_draft_command(other_ws,draft,1,'discard'); RAISE EXCEPTION 'Foreign draft accepted';
 EXCEPTION WHEN no_data_found THEN NULL; END;
 BEGIN
  PERFORM public.wardrobe_draft_command(ws,draft,2,'discard'); RAISE EXCEPTION 'Stale draft accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 result:=public.wardrobe_draft_command(ws,draft,1,'confirm',jsonb_build_object('proposalId',proposal,'name','Synthetic wardrobe SQL fixture','category','top','description','','color','','attributes','{}'::jsonb,'inferred_attributes','{}'::jsonb,'provenance','{}'::jsonb,'corrections','{}'::jsonb,'confidence',NULL,'uncertainty','[]'::jsonb,'source_type','manual'));
 repeated:=public.wardrobe_draft_command(ws,draft,1,'confirm',jsonb_build_object('proposalId',proposal));
 IF result->>'itemId' IS DISTINCT FROM repeated->>'itemId' OR (SELECT count(*) FROM public.wardrobe_items WHERE workspace_id=ws)<>1 THEN RAISE EXCEPTION 'Wardrobe confirmation was duplicated'; END IF;
 BEGIN
  PERFORM public.wardrobe_item_command(other_ws,(result->>'itemId')::uuid,1,'archive'); RAISE EXCEPTION 'Foreign item accepted';
 EXCEPTION WHEN no_data_found THEN NULL; END;
 op:=public.start_workflow_operation(ws,'wardrobe_description','draft',second,1,repeat('a',64));
 op:=public.claim_workflow_operation(ws,op.id,1);
 BEGIN
  PERFORM public.finish_wardrobe_description(ws,op.id,op.attempt_count+1,op.input_fingerprint,payload); RAISE EXCEPTION 'Stale attempt completion accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM public.wardrobe_draft_command(ws,second,1,'discard');
 PERFORM public.finish_wardrobe_description(ws,op.id,op.attempt_count,op.input_fingerprint,payload);
 IF NOT EXISTS(SELECT 1 FROM public.workflow_operations WHERE workspace_id=ws AND id=op.id AND status='superseded') THEN RAISE EXCEPTION 'Changed draft result was published'; END IF;
 IF (SELECT status FROM public.workflow_drafts WHERE workspace_id=ws AND id=second)<>'discarded' THEN RAISE EXCEPTION 'Discarded draft was overwritten'; END IF;
END; $$;
ROLLBACK;
SELECT 'wardrobe policy, scoping, idempotency, revision and attempt fencing checks passed; fixtures rolled back' AS result;
