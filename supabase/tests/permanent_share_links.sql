BEGIN;
DO $$
DECLARE w uuid := gen_random_uuid(); s uuid := gen_random_uuid(); permanent uuid := gen_random_uuid();
  finite uuid := gen_random_uuid(); expired uuid := gen_random_uuid(); listing jsonb;
BEGIN
  INSERT INTO public.workspaces(id,name) VALUES(w,'__permanent_share_test_'||w::text);
  INSERT INTO public.saved_look_snapshots(id,workspace_id,source_kind,source_revision,title,items,idempotency_key,source_type)
  VALUES(s,w,'preview',1,'Permanent share test','[{"name":"Synthetic shirt","category":"top","attributes":{}}]','fixture','sample');
  INSERT INTO public.share_links(id,workspace_id,saved_look_id,token_hash,public_snapshot,expires_at)
  VALUES(permanent,w,s,repeat('1',64),'{"title":"Permanent share test","items":[{"name":"Synthetic shirt","category":"top"}]}',NULL),
    (finite,w,s,repeat('2',64),'{"title":"Permanent share test","items":[{"name":"Synthetic shirt","category":"top"}]}',now()+interval '1 hour');
  INSERT INTO public.share_links(id,workspace_id,saved_look_id,token_hash,public_snapshot,created_at,expires_at)
  VALUES(expired,w,s,repeat('3',64),'{"title":"Permanent share test","items":[{"name":"Synthetic shirt","category":"top"}]}',now()-interval '2 days',now()-interval '1 day');
  listing := public.list_saved_looks(w,'shared',20,NULL,NULL);
  IF (listing#>>'{counts,shared}')::integer<>1 THEN RAISE EXCEPTION 'Permanent publication not counted'; END IF;
  IF jsonb_array_length(public.list_saved_looks(gen_random_uuid(),'shared',20,NULL,NULL)->'items')<>0 THEN
    RAISE EXCEPTION 'Foreign workspace leaked';
  END IF;
  BEGIN
    UPDATE public.share_links SET expires_at=now()+interval '1 hour' WHERE workspace_id=w AND id=permanent;
    RAISE EXCEPTION 'Publication expiry became mutable';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.share_links SET revoked_at=clock_timestamp() WHERE workspace_id=w AND id=permanent;
  IF (public.list_saved_looks(w,'shared',20,NULL,NULL)#>>'{counts,shared}')::integer<>1 THEN
    RAISE EXCEPTION 'Legacy active finite publication lost';
  END IF;
  UPDATE public.share_links SET revoked_at=clock_timestamp() WHERE workspace_id=w AND id=finite;
  IF (public.list_saved_looks(w,'shared',20,NULL,NULL)#>>'{counts,shared}')::integer<>0 THEN
    RAISE EXCEPTION 'Revoked or expired publication counted';
  END IF;
  BEGIN
    UPDATE public.share_links SET revoked_at=NULL WHERE workspace_id=w AND id=permanent;
    RAISE EXCEPTION 'Revocation was reversible';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF has_function_privilege('anon','public.list_saved_looks(uuid,text,integer,timestamptz,uuid)','EXECUTE')
    OR has_table_privilege('anon','public.share_links','SELECT') THEN
    RAISE EXCEPTION 'Anonymous direct access was granted';
  END IF;
END;
$$;
ROLLBACK;
SELECT 'Permanent, legacy, expiry, revocation and workspace tests passed; fixtures rolled back' AS result;
