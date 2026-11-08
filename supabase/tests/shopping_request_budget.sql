BEGIN;
SET LOCAL ROLE service_role;
SET LOCAL TIME ZONE 'Pacific/Honolulu';

DO $$
DECLARE ws uuid := gen_random_uuid(); foreign_ws uuid := gen_random_uuid(); look_id uuid := gen_random_uuid();
  option_id uuid := gen_random_uuid(); slot uuid := gen_random_uuid(); search_a uuid := gen_random_uuid();
  search_b uuid := gen_random_uuid(); calls bigint; n integer; day date := (clock_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
  IF has_function_privilege('anon', 'public.reserve_shopping_provider_call(uuid,uuid,integer)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.reserve_shopping_provider_call(uuid,uuid,integer)', 'EXECUTE')
    OR has_table_privilege('anon', 'public.shopping_searches', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated', 'public.workflow_provider_daily_budgets', 'SELECT,INSERT,UPDATE,DELETE')
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.workflow_provider_daily_budgets'::regclass) THEN
    RAISE EXCEPTION 'Shopping request budget exposed';
  END IF;
  INSERT INTO public.workspaces(id,name) VALUES (ws,'__shopping_budget_'||ws), (foreign_ws,'__shopping_budget_foreign_'||foreign_ws);
  INSERT INTO public.looks(id,workspace_id,title) VALUES (look_id,ws,'Synthetic shopping budget look');
  INSERT INTO public.outfit_options(id,workspace_id,look_id,option_type,title,source_revision)
    VALUES (option_id,ws,look_id,'closest','Synthetic shopping budget option',1);
  INSERT INTO public.outfit_option_items(id,workspace_id,look_id,option_id,slot_id,category,item_kind,missing_brief)
    VALUES (slot,ws,look_id,option_id,'top','top','missing','{"description":"Synthetic test shirt"}');
  INSERT INTO public.shopping_searches(id,workspace_id,look_id,option_id,option_item_id,slot_id,option_revision,query,provider,input_fingerprint)
    VALUES (search_a,ws,look_id,option_id,slot,'top',1,'synthetic shirt','synthetic',repeat('a',64)),
      (search_b,ws,look_id,option_id,slot,'top',1,'synthetic retry','synthetic',repeat('b',64));
  BEGIN
    PERFORM public.reserve_shopping_provider_call(foreign_ws,search_a);
    RAISE EXCEPTION 'Foreign shopping reservation accepted';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  FOR n IN 1..3 LOOP PERFORM public.reserve_shopping_provider_call(ws,search_a,4); END LOOP;
  BEGIN
    PERFORM public.reserve_shopping_provider_call(ws,search_a,4);
    RAISE EXCEPTION 'Fourth per-search request accepted';
  EXCEPTION WHEN program_limit_exceeded THEN NULL; END;
  PERFORM public.reserve_shopping_provider_call(ws,search_b,4);
  BEGIN
    PERFORM public.reserve_shopping_provider_call(ws,search_b,4);
    RAISE EXCEPTION 'Daily shopping budget exceeded';
  EXCEPTION WHEN program_limit_exceeded THEN NULL; END;
  SELECT search_calls INTO calls FROM public.workflow_provider_daily_budgets WHERE workspace_id = ws AND budget_date = day;
  IF calls <> 4 OR (SELECT provider_call_count FROM public.shopping_searches WHERE workspace_id = ws AND id = search_a) <> 3
    OR (SELECT provider_call_count FROM public.shopping_searches WHERE workspace_id = ws AND id = search_b) <> 1 THEN
    RAISE EXCEPTION 'Rejected reservation changed atomic counters or used non-UTC date';
  END IF;
  UPDATE public.shopping_searches SET status='succeeded' WHERE workspace_id = ws AND id = search_b;
  BEGIN
    PERFORM public.reserve_shopping_provider_call(ws,search_b,10);
    RAISE EXCEPTION 'Completed search reserved a paid request';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  UPDATE public.shopping_searches SET status='running' WHERE workspace_id = ws AND id = search_b;
  UPDATE public.outfit_options SET revision=revision+1 WHERE workspace_id = ws AND id = option_id;
  BEGIN
    PERFORM public.reserve_shopping_provider_call(ws,search_b,10);
    RAISE EXCEPTION 'Stale option search reserved a paid request';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  IF (SELECT text_calls + image_calls FROM public.workflow_provider_daily_budgets WHERE workspace_id = ws AND budget_date = day) <> 0 THEN
    RAISE EXCEPTION 'Shopping altered AI request counters';
  END IF;
END; $$;

ROLLBACK;
SELECT 'shopping request quota, UTC day, private access, scope, stale input and atomic cap checks passed; fixtures rolled back' AS result;
