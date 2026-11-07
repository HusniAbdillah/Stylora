BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  ws uuid := gen_random_uuid(); foreign_ws uuid := gen_random_uuid(); saved uuid := gen_random_uuid();
  asset uuid := gen_random_uuid(); old_op public.workflow_operations; op public.workflow_operations;
  prior public.saved_look_media; fresh public.saved_look_media; replay public.saved_look_media;
  command uuid := gen_random_uuid(); second_command uuid := gen_random_uuid(); share uuid := gen_random_uuid();
  snapshot_before jsonb; count_before integer;
BEGIN
  INSERT INTO public.workspaces(id,name) VALUES (ws,'regenerate_' || ws), (foreign_ws,'regenerate_' || foreign_ws);
  INSERT INTO public.assets(id,workspace_id,bucket,storage_path,mime_type,byte_size,status,source_type)
    VALUES (asset,ws,'previews',ws::text || '/' || asset || '.png','image/png',1,'ready','sample');
  INSERT INTO public.saved_look_snapshots(id,workspace_id,source_kind,source_revision,title,items,idempotency_key,source_type)
    VALUES (saved,ws,'preview',1,'Synthetic immutable look','[{"name":"Synthetic shirt","category":"top"}]',saved::text,'sample');
  SELECT to_jsonb(s) INTO snapshot_before FROM public.saved_look_snapshots s WHERE workspace_id=ws AND id=saved;
  old_op := public.start_workflow_operation(ws,'saved_avatar','saved_look',saved,1,repeat('a',64));
  INSERT INTO public.saved_look_media(workspace_id,saved_look_id,operation_id,preference_snapshot_hash)
    VALUES (ws,saved,old_op.id,repeat('b',64)) RETURNING * INTO prior;
  old_op := public.claim_workflow_operation(ws,old_op.id,1);
  PERFORM public.complete_saved_avatar(ws,old_op.id,1,repeat('a',64),asset,repeat('c',64));
  INSERT INTO public.share_links(id,workspace_id,saved_look_id,token_hash,public_snapshot,approved_media_ids,expires_at)
    VALUES (share,ws,saved,repeat('d',64),'{"title":"Synthetic immutable look","items":[{"name":"Synthetic shirt","category":"top","colors":[]}]}',
      ARRAY[prior.id],clock_timestamp()+interval '1 hour');
  BEGIN
    PERFORM public.regenerate_saved_look_media(foreign_ws,saved,prior.id,command);
    RAISE EXCEPTION 'Foreign regeneration accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  fresh := public.regenerate_saved_look_media(ws,saved,prior.id,command);
  IF fresh.id=prior.id OR fresh.operation_id=old_op.id OR fresh.status<>'queued' THEN
    RAISE EXCEPTION 'Regeneration did not create a separate queued media command';
  END IF;
  SELECT * INTO op FROM public.workflow_operations WHERE workspace_id=ws AND id=fresh.operation_id;
  IF op.input IS DISTINCT FROM jsonb_build_object('intent','regenerate','requestId',command)
    OR op.subject_id<>saved OR op.input_revision<>1 OR op.input_fingerprint=old_op.input_fingerprint THEN
    RAISE EXCEPTION 'Regeneration command identity is invalid';
  END IF;
  replay := public.regenerate_saved_look_media(ws,saved,prior.id,command);
  IF replay.id<>fresh.id THEN RAISE EXCEPTION 'Queued command replay duplicated media'; END IF;
  SELECT count(*) INTO count_before FROM public.workflow_operations WHERE workspace_id=ws;
  BEGIN
    PERFORM public.regenerate_saved_look_media(ws,saved,fresh.id,second_command);
    RAISE EXCEPTION 'Queued command accepted another regeneration';
  EXCEPTION WHEN lock_not_available THEN NULL;
  END;
  IF (SELECT count(*) FROM public.workflow_operations WHERE workspace_id=ws)<>count_before THEN
    RAISE EXCEPTION 'Busy regeneration created an operation';
  END IF;
  op := public.claim_workflow_operation(ws,fresh.operation_id,1);
  BEGIN
    PERFORM public.regenerate_saved_look_media(ws,saved,fresh.id,second_command);
    RAISE EXCEPTION 'Running command accepted another regeneration';
  EXCEPTION WHEN lock_not_available THEN NULL;
  END;
  PERFORM public.complete_saved_avatar(ws,op.id,op.attempt_count,op.input_fingerprint,asset,repeat('c',64));
  replay := public.regenerate_saved_look_media(ws,saved,prior.id,command);
  IF replay.id<>fresh.id OR replay.status<>'succeeded' THEN RAISE EXCEPTION 'Completed command replay failed'; END IF;
  BEGIN
    PERFORM public.regenerate_saved_look_media(ws,saved,prior.id,second_command);
    RAISE EXCEPTION 'Stale latest media was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  replay := public.regenerate_saved_look_media(ws,saved,fresh.id,second_command);
  IF replay.id=fresh.id OR replay.status<>'queued' THEN RAISE EXCEPTION 'New regeneration command was deduplicated'; END IF;
  fresh := public.regenerate_saved_look_media(ws,saved,prior.id,command);
  IF fresh.operation_id<>op.id THEN RAISE EXCEPTION 'Old command replay changed after a newer command'; END IF;
  IF (SELECT to_jsonb(s) FROM public.saved_look_snapshots s WHERE workspace_id=ws AND id=saved) IS DISTINCT FROM snapshot_before
    OR NOT EXISTS (SELECT 1 FROM public.saved_look_media WHERE workspace_id=ws AND id=prior.id AND output_asset_id=asset AND status='succeeded')
    OR NOT EXISTS (SELECT 1 FROM public.share_links WHERE workspace_id=ws AND id=share AND approved_media_ids=ARRAY[prior.id]) THEN
    RAISE EXCEPTION 'Regeneration changed immutable or approved prior data';
  END IF;
  IF has_function_privilege('anon','public.regenerate_saved_look_media(uuid,uuid,uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.regenerate_saved_look_media(uuid,uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Public regeneration execution is allowed';
  END IF;
END;
$$;
ROLLBACK;
