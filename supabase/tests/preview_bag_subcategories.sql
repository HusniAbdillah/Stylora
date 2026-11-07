BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  ws uuid := gen_random_uuid(); item uuid := gen_random_uuid(); draft uuid := gen_random_uuid();
  subtype text; saved jsonb;
BEGIN
  INSERT INTO public.workspaces(id,name) VALUES (ws,'bag_contract_' || ws);
  INSERT INTO public.wardrobe_items(id,workspace_id,name,category,subcategory,inventory_status,source_type)
    VALUES (item,ws,'Synthetic bag','accessory','purse','owned','sample');
  INSERT INTO public.workflow_drafts(id,workspace_id,feature_kind,payload)
    VALUES (draft,ws,'preview',jsonb_build_object('selection',jsonb_build_object('bags',item)));
  FOREACH subtype IN ARRAY ARRAY['bag','tote','clutch','backpack','handbag','crossbody purse','satchel','duffel','briefcase','messenger'] LOOP
    UPDATE public.wardrobe_items SET subcategory = subtype WHERE workspace_id = ws AND id = item;
    saved := public.save_studio_look(ws,'preview',draft,NULL,1,'bag_' || subtype,'Synthetic saved bag');
    IF NOT EXISTS (SELECT 1 FROM public.saved_look_snapshots WHERE workspace_id = ws
      AND id = (saved ->> 'savedLookId')::uuid AND items -> 0 ->> 'id' = item::text) THEN
      RAISE EXCEPTION 'Supported bag subtype was not saved';
    END IF;
  END LOOP;
  UPDATE public.workflow_drafts SET payload = jsonb_build_object('selection',jsonb_build_object('accessories',item))
    WHERE workspace_id = ws AND id = draft;
  BEGIN
    PERFORM public.save_studio_look(ws,'preview',draft,NULL,1,'wrong_accessory_slot','Synthetic wrong slot');
    RAISE EXCEPTION 'Bag was accepted in the general accessory slot';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.wardrobe_items SET subcategory = 'scarf' WHERE workspace_id = ws AND id = item;
  UPDATE public.workflow_drafts SET payload = jsonb_build_object('selection',jsonb_build_object('bags',item))
    WHERE workspace_id = ws AND id = draft;
  BEGIN
    PERFORM public.save_studio_look(ws,'preview',draft,NULL,1,'wrong_bag_slot','Synthetic wrong slot');
    RAISE EXCEPTION 'Scarf was accepted in the bag slot';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;
ROLLBACK;
