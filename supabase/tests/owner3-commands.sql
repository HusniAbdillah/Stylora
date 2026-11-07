BEGIN;
DO $$
DECLARE
  w uuid := gen_random_uuid(); s uuid := gen_random_uuid(); a uuid := gen_random_uuid();
  m uuid := gen_random_uuid(); link uuid := gen_random_uuid();
  op public.workflow_operations; retried public.saved_look_media; listing jsonb;
BEGIN
  INSERT INTO public.workspaces(id,name) VALUES(w,'__owner3_smoke_'||w::text);
  INSERT INTO public.saved_look_snapshots(id,workspace_id,source_kind,source_revision,title,items,idempotency_key,source_type)
  VALUES(s,w,'preview',1,'Synthetic command fixture','[{"name":"Synthetic shirt","category":"top","attributes":{}}]','fixture','sample');
  op := public.start_workflow_operation(w,'saved_avatar','saved_look',s,1,repeat('d',64));
  INSERT INTO public.saved_look_media(id,workspace_id,saved_look_id,operation_id,preference_snapshot_hash)
  VALUES(m,w,s,op.id,repeat('a',64));
  UPDATE public.workflow_operations SET status='failed',completed_at=now(),attempt_count=1 WHERE workspace_id=w AND id=op.id;
  UPDATE public.saved_look_media SET status='failed' WHERE workspace_id=w AND id=m;
  retried := public.retry_saved_look_media(w,s);
  IF retried.id<>m OR retried.operation_id<>op.id OR retried.status<>'queued' THEN RAISE EXCEPTION 'Retry identity failed'; END IF;
  retried := public.retry_saved_look_media(w,s);
  IF retried.id<>m THEN RAISE EXCEPTION 'Retry duplicated media'; END IF;
  listing := public.list_saved_looks(w,'preparing',20,NULL,NULL);
  IF (listing#>>'{counts,preparing}')::integer<>1 OR jsonb_array_length(listing->'items')<>1 THEN RAISE EXCEPTION 'Preparing filter failed'; END IF;
  INSERT INTO public.assets(id,workspace_id,bucket,storage_path,mime_type,byte_size,status,source_type)
  VALUES(a,w,'previews',w::text||'/'||a::text||'/'||gen_random_uuid()::text||'.png','image/png',1,'ready','sample');
  UPDATE public.saved_look_media SET status='succeeded',output_asset_id=a WHERE workspace_id=w AND id=m;
  INSERT INTO public.share_links(id,workspace_id,saved_look_id,token_hash,public_snapshot,approved_media_ids,expires_at)
  VALUES(link,w,s,repeat('e',64),'{"title":"Synthetic command fixture","items":[{"name":"Synthetic shirt","category":"top"}]}',ARRAY[m],now()+interval '1 hour');
  UPDATE public.assets SET status='detached' WHERE workspace_id=w AND id=a;
  UPDATE public.share_links SET revoked_at=clock_timestamp() WHERE workspace_id=w AND id=link;
  IF NOT EXISTS(SELECT 1 FROM public.share_links WHERE workspace_id=w AND id=link AND revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'Revocation failed'; END IF;
  BEGIN
    UPDATE public.share_links SET revoked_at=NULL WHERE workspace_id=w AND id=link;
    RAISE EXCEPTION 'Revocation was reversible';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  PERFORM public.delete_saved_look(w,s);
  IF EXISTS(SELECT 1 FROM public.saved_look_snapshots WHERE workspace_id=w AND id=s)
    OR EXISTS(SELECT 1 FROM public.workflow_operations WHERE workspace_id=w AND id=op.id)
    OR EXISTS(SELECT 1 FROM public.share_links WHERE workspace_id=w AND id=link) THEN RAISE EXCEPTION 'Atomic deletion failed'; END IF;
END;
$$;
ROLLBACK;
SELECT 'Owner 3 command smoke passed; synthetic fixtures rolled back' AS result;
