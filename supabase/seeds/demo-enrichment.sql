-- Curated samples only. This seed adds data to demo and never starts providers.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
SET LOCAL ROLE service_role;
DO $enrich$
DECLARE
  manifest jsonb := $manifest$
{
  "version": "stylora-demo-enrichment-v1",
  "workspaceId": "58fcedac-9b26-48b3-bf12-98af3f6c9b27",
  "workspaceName": "demo",
  "outfits": [
    {
      "key": "soft-workday",
      "title": "Sample: soft workday",
      "rationale": "The blush blouse and cream trousers create a soft tonal base. Pointed flats and the structured navy bag add a sharper outline for a relaxed office setting.",
      "difference": "A softer palette than the dark gallery edit; this is business casual, not formal tailoring.",
      "uncertainty": "Check the blouse neckline and workplace dress code. Fabric composition, fit and all-day comfort are not verified.",
      "items": [
        {
          "id": "c089eaef-3eee-8f41-84a3-a6f16db545ce",
          "name": "Blush V-neck bell-sleeve blouse",
          "category": "top"
        },
        {
          "id": "bad0bdd6-677b-8e88-990c-15a95b37f1ef",
          "name": "Cream straight-leg trousers",
          "category": "bottom"
        },
        {
          "id": "05e1c920-885a-8c35-95c0-49f5210ace00",
          "name": "Blush pink pointed flats",
          "category": "shoes"
        },
        {
          "id": "654b8f54-c0aa-8b37-8108-8f86d526d129",
          "name": "Navy structured bag with adjustable strap",
          "category": "accessory"
        },
        {
          "id": "890fd6cb-132b-85d5-918d-bf3aa290ac4f",
          "name": "Copper-tone bracelet watch with brown dial",
          "category": "accessory"
        }
      ],
      "id": "d4e13b60-9db2-4d65-aaf4-000000000100",
      "draftId": "d4e13b60-9db2-4d65-aaf4-000000000200"
    },
    {
      "key": "city-walk",
      "title": "Sample: city walk",
      "rationale": "The white graphic T-shirt keeps the pink jeans casual. Pale sneakers repeat the light top while the blue tote introduces a cool accent.",
      "difference": "Uses a graphic top and jeans instead of a blouse and trousers.",
      "uncertainty": "Sneaker comfort, tote capacity and weather suitability are not verified.",
      "items": [
        {
          "id": "038c9f7c-a8f7-8ce2-a2fc-b4fbbbc6e4ca",
          "name": "White fox-graphic T-shirt",
          "category": "top"
        },
        {
          "id": "30e399cb-c174-8681-8c47-163665f5fc15",
          "name": "Dusty pink straight-leg jeans",
          "category": "bottom"
        },
        {
          "id": "d74c8e10-7194-8813-b3e1-94a744a0e71b",
          "name": "White low-top sneakers with pale side stripes",
          "category": "shoes"
        },
        {
          "id": "26e681cc-b20f-8724-90f2-de715e7b2755",
          "name": "Dusty blue shoulder tote",
          "category": "accessory"
        }
      ],
      "id": "d4e13b60-9db2-4d65-aaf4-000000000101",
      "draftId": "d4e13b60-9db2-4d65-aaf4-000000000201"
    },
    {
      "key": "gallery-afternoon",
      "title": "Sample: gallery afternoon",
      "rationale": "Cream trousers separate the dark floral top from the navy bag so the print remains the focal point. The pointed flats keep the outline understated.",
      "difference": "A darker printed focal point than the soft workday edit.",
      "uncertainty": "Confirm the top's opacity and venue dress code; lining and fiber content are unknown.",
      "items": [
        {
          "id": "a9ef7c1a-73c9-8c34-aaa1-36210ab467f7",
          "name": "Dark floral high-neck top",
          "category": "top"
        },
        {
          "id": "bad0bdd6-677b-8e88-990c-15a95b37f1ef",
          "name": "Cream straight-leg trousers",
          "category": "bottom"
        },
        {
          "id": "05e1c920-885a-8c35-95c0-49f5210ace00",
          "name": "Blush pink pointed flats",
          "category": "shoes"
        },
        {
          "id": "654b8f54-c0aa-8b37-8108-8f86d526d129",
          "name": "Navy structured bag with adjustable strap",
          "category": "accessory"
        }
      ],
      "id": "d4e13b60-9db2-4d65-aaf4-000000000102",
      "draftId": "d4e13b60-9db2-4d65-aaf4-000000000202"
    },
    {
      "key": "coastal-lunch",
      "title": "Sample: coastal lunch",
      "rationale": "The leaf-print dress supplies the main color and pattern. Tan sandals keep the footwear quieter, while the blue tote adds a contrasting accent.",
      "difference": "Uses a single dress rather than separate top and bottom pieces.",
      "uncertainty": "Block heels may be unsuitable for sand or long walks. Sun protection and fabric breathability are not established.",
      "items": [
        {
          "id": "c3bac536-336b-8a49-bc0c-9595cd2031ef",
          "name": "Pink leaf-print sleeveless dress",
          "category": "dress"
        },
        {
          "id": "83610b83-8c0e-8391-801a-c821d7e46ce5",
          "name": "Tan block-heel ring sandals",
          "category": "shoes"
        },
        {
          "id": "26e681cc-b20f-8724-90f2-de715e7b2755",
          "name": "Dusty blue shoulder tote",
          "category": "accessory"
        }
      ],
      "id": "d4e13b60-9db2-4d65-aaf4-000000000103",
      "draftId": "d4e13b60-9db2-4d65-aaf4-000000000203"
    },
    {
      "key": "dinner-florals",
      "title": "Sample: dinner florals",
      "rationale": "The floral-outline sheath provides a defined one-piece silhouette. Tan sandals and the copper-tone watch add warmer details against the dark dress and bag.",
      "difference": "A more defined dress silhouette than the relaxed coastal edit.",
      "uncertainty": "Check venue formality, hem length and seated fit. This combination does not establish fit or heel comfort.",
      "items": [
        {
          "id": "7ce99819-bd0d-811b-a40f-84640e6b4438",
          "name": "Black floral-outline sheath dress",
          "category": "dress"
        },
        {
          "id": "83610b83-8c0e-8391-801a-c821d7e46ce5",
          "name": "Tan block-heel ring sandals",
          "category": "shoes"
        },
        {
          "id": "654b8f54-c0aa-8b37-8108-8f86d526d129",
          "name": "Navy structured bag with adjustable strap",
          "category": "accessory"
        },
        {
          "id": "890fd6cb-132b-85d5-918d-bf3aa290ac4f",
          "name": "Copper-tone bracelet watch with brown dial",
          "category": "accessory"
        }
      ],
      "id": "d4e13b60-9db2-4d65-aaf4-000000000104",
      "draftId": "d4e13b60-9db2-4d65-aaf4-000000000204"
    },
    {
      "key": "active-morning",
      "title": "Sample: active morning",
      "rationale": "The training top, track pants and mesh trainers share an activewear role. A dark tonal base keeps the bronze shoe details distinct.",
      "difference": "An activewear composition, separate from the smart-casual edits.",
      "uncertainty": "Specific sports performance, support and injury protection cannot be inferred from these photographs.",
      "items": [
        {
          "id": "c0e5069f-920c-87f6-b632-8592a14f7c49",
          "name": "Black tonal-stripe training top",
          "category": "top"
        },
        {
          "id": "41a36268-93c5-8453-9311-47ed1aa94a6a",
          "name": "Charcoal straight-leg track pants",
          "category": "bottom"
        },
        {
          "id": "0303e89a-0c35-8bb9-a552-bc4945c4fba3",
          "name": "Gray mesh trainers with bronze overlays",
          "category": "shoes"
        }
      ],
      "id": "d4e13b60-9db2-4d65-aaf4-000000000105",
      "draftId": "d4e13b60-9db2-4d65-aaf4-000000000205"
    },
    {
      "key": "weekend-stripes",
      "title": "Sample: weekend stripes",
      "rationale": "Navy stripes and faded denim create a blue-led casual palette. White sneakers repeat the lighter stripe tones and keep the outfit informal.",
      "difference": "Uses a denim skirt and striped top rather than jeans and a graphic T-shirt.",
      "uncertainty": "Confirm skirt mobility, coverage and shoe comfort; weather protection is not verified.",
      "items": [
        {
          "id": "a47c82fe-6ec8-895b-8c83-3a9745bf77ef",
          "name": "Navy striped top with yellow trim",
          "category": "top"
        },
        {
          "id": "67248861-0f26-8d97-814c-decd455406fe",
          "name": "Faded blue denim skirt",
          "category": "bottom"
        },
        {
          "id": "d74c8e10-7194-8813-b3e1-94a744a0e71b",
          "name": "White low-top sneakers with pale side stripes",
          "category": "shoes"
        },
        {
          "id": "26e681cc-b20f-8724-90f2-de715e7b2755",
          "name": "Dusty blue shoulder tote",
          "category": "accessory"
        }
      ],
      "id": "d4e13b60-9db2-4d65-aaf4-000000000106",
      "draftId": "d4e13b60-9db2-4d65-aaf4-000000000206"
    },
    {
      "key": "cool-day-layer",
      "title": "Sample: cool-day layer",
      "rationale": "The white T-shirt and pink jeans form a light base under the navy coat. The navy bag repeats the outer layer and white sneakers keep the look casual.",
      "difference": "Adds a removable outer layer to the city-walk composition.",
      "uncertainty": "The coat is not verified waterproof or insulated. Check room for layering and the actual weather.",
      "items": [
        {
          "id": "02c126d6-52df-85b4-a6c1-f2b529f16ba9",
          "name": "White illustrated T-shirt",
          "category": "top"
        },
        {
          "id": "30e399cb-c174-8681-8c47-163665f5fc15",
          "name": "Dusty pink straight-leg jeans",
          "category": "bottom"
        },
        {
          "id": "236f902d-18ec-8fc3-acfd-78a59d388f13",
          "name": "Navy hooded coat with striped lining",
          "category": "outerwear"
        },
        {
          "id": "d74c8e10-7194-8813-b3e1-94a744a0e71b",
          "name": "White low-top sneakers with pale side stripes",
          "category": "shoes"
        },
        {
          "id": "654b8f54-c0aa-8b37-8108-8f86d526d129",
          "name": "Navy structured bag with adjustable strap",
          "category": "accessory"
        }
      ],
      "id": "d4e13b60-9db2-4d65-aaf4-000000000107",
      "draftId": "d4e13b60-9db2-4d65-aaf4-000000000207"
    }
  ],
  "capsules": [
    {
      "key": "everyday",
      "title": "Sample: everyday rotation",
      "templateId": "everyday-ease",
      "outfitKeys": [
        "city-walk",
        "weekend-stripes",
        "cool-day-layer"
      ],
      "brief": {
        "days": 5,
        "targetOutfits": 3,
        "activities": [
          "Everyday errands"
        ],
        "weather": "Mild",
        "laundry": "Can wash once",
        "notes": "Sample planning brief. Curated seed, not an AI-generated result. Review the selections before generating outfits.",
        "palette": "Soft neutrals",
        "dressCode": "Casual",
        "luggage": null,
        "footwear": "Walkable flats",
        "coverage": null,
        "care": "Easy care",
        "requiredItemIds": [],
        "excludedItemIds": [],
        "templateId": "everyday-ease",
        "includedItemIds": [
          "038c9f7c-a8f7-8ce2-a2fc-b4fbbbc6e4ca",
          "30e399cb-c174-8681-8c47-163665f5fc15",
          "d74c8e10-7194-8813-b3e1-94a744a0e71b",
          "26e681cc-b20f-8724-90f2-de715e7b2755",
          "a47c82fe-6ec8-895b-8c83-3a9745bf77ef",
          "67248861-0f26-8d97-814c-decd455406fe",
          "02c126d6-52df-85b4-a6c1-f2b529f16ba9",
          "236f902d-18ec-8fc3-acfd-78a59d388f13",
          "654b8f54-c0aa-8b37-8108-8f86d526d129"
        ]
      },
      "id": "d4e13b60-9db2-4d65-aaf4-000000000300"
    },
    {
      "key": "workweek",
      "title": "Sample: relaxed workweek",
      "templateId": "modern-workweek",
      "outfitKeys": [
        "soft-workday",
        "gallery-afternoon"
      ],
      "brief": {
        "days": 5,
        "targetOutfits": 3,
        "activities": [
          "Office days",
          "Lunch meetings"
        ],
        "weather": "Mild",
        "laundry": "Can wash once",
        "notes": "Sample planning brief. Curated seed, not an AI-generated result. Review the selections before generating outfits.",
        "palette": "Blush, cream and navy",
        "dressCode": "Business casual",
        "luggage": null,
        "footwear": "Walkable flats",
        "coverage": null,
        "care": "Easy care",
        "requiredItemIds": [],
        "excludedItemIds": [],
        "templateId": "modern-workweek",
        "includedItemIds": [
          "c089eaef-3eee-8f41-84a3-a6f16db545ce",
          "bad0bdd6-677b-8e88-990c-15a95b37f1ef",
          "05e1c920-885a-8c35-95c0-49f5210ace00",
          "654b8f54-c0aa-8b37-8108-8f86d526d129",
          "890fd6cb-132b-85d5-918d-bf3aa290ac4f",
          "a9ef7c1a-73c9-8c34-aaa1-36210ab467f7"
        ]
      },
      "id": "d4e13b60-9db2-4d65-aaf4-000000000301"
    },
    {
      "key": "travel",
      "title": "Sample: three-day city break",
      "templateId": "weekend-travel",
      "outfitKeys": [
        "city-walk",
        "weekend-stripes",
        "cool-day-layer"
      ],
      "brief": {
        "days": 3,
        "targetOutfits": 3,
        "activities": [
          "City walks",
          "Museum visits"
        ],
        "weather": "Mild",
        "laundry": "Can wash once",
        "notes": "Sample planning brief. Curated seed, not an AI-generated result. Review the selections before generating outfits.",
        "palette": "Navy with soft color",
        "dressCode": "Casual",
        "luggage": "Carry-on",
        "footwear": "Walkable flats",
        "coverage": null,
        "care": "Easy care",
        "requiredItemIds": [],
        "excludedItemIds": [],
        "templateId": "weekend-travel",
        "includedItemIds": [
          "038c9f7c-a8f7-8ce2-a2fc-b4fbbbc6e4ca",
          "30e399cb-c174-8681-8c47-163665f5fc15",
          "d74c8e10-7194-8813-b3e1-94a744a0e71b",
          "26e681cc-b20f-8724-90f2-de715e7b2755",
          "a47c82fe-6ec8-895b-8c83-3a9745bf77ef",
          "67248861-0f26-8d97-814c-decd455406fe",
          "02c126d6-52df-85b4-a6c1-f2b529f16ba9",
          "236f902d-18ec-8fc3-acfd-78a59d388f13",
          "654b8f54-c0aa-8b37-8108-8f86d526d129"
        ]
      },
      "id": "d4e13b60-9db2-4d65-aaf4-000000000302"
    },
    {
      "key": "summer",
      "title": "Sample: warm-weather weekend",
      "templateId": "warm-weather",
      "outfitKeys": [
        "coastal-lunch",
        "weekend-stripes"
      ],
      "brief": {
        "days": 2,
        "targetOutfits": 3,
        "activities": [
          "Outdoor lunch",
          "Short city visits"
        ],
        "weather": "Warm",
        "laundry": "Can wash once",
        "notes": "Sample planning brief. Curated seed, not an AI-generated result. Review the selections before generating outfits.",
        "palette": "Pink, blue and tan",
        "dressCode": "Casual",
        "luggage": null,
        "footwear": "Flats and optional block heels",
        "coverage": "Sleeveless options",
        "care": "Easy care",
        "requiredItemIds": [],
        "excludedItemIds": [],
        "templateId": "warm-weather",
        "includedItemIds": [
          "c3bac536-336b-8a49-bc0c-9595cd2031ef",
          "83610b83-8c0e-8391-801a-c821d7e46ce5",
          "26e681cc-b20f-8724-90f2-de715e7b2755",
          "a47c82fe-6ec8-895b-8c83-3a9745bf77ef",
          "67248861-0f26-8d97-814c-decd455406fe",
          "d74c8e10-7194-8813-b3e1-94a744a0e71b"
        ]
      },
      "id": "d4e13b60-9db2-4d65-aaf4-000000000303"
    },
    {
      "key": "evening",
      "title": "Sample: dinner plans",
      "templateId": "evening",
      "outfitKeys": [
        "dinner-florals",
        "gallery-afternoon"
      ],
      "brief": {
        "days": 3,
        "targetOutfits": 3,
        "activities": [
          "Dinner",
          "Gallery visit"
        ],
        "weather": "Mild",
        "laundry": "Can wash once",
        "notes": "Sample planning brief, not an AI result. No formal-event or fit guarantee. Check the venue dress code.",
        "palette": "Dark florals and cream",
        "dressCode": "Smart casual",
        "luggage": null,
        "footwear": "Flats or block heels",
        "coverage": null,
        "care": "Easy care",
        "requiredItemIds": [],
        "excludedItemIds": [],
        "templateId": "evening",
        "includedItemIds": [
          "7ce99819-bd0d-811b-a40f-84640e6b4438",
          "83610b83-8c0e-8391-801a-c821d7e46ce5",
          "654b8f54-c0aa-8b37-8108-8f86d526d129",
          "890fd6cb-132b-85d5-918d-bf3aa290ac4f",
          "a9ef7c1a-73c9-8c34-aaa1-36210ab467f7",
          "bad0bdd6-677b-8e88-990c-15a95b37f1ef",
          "05e1c920-885a-8c35-95c0-49f5210ace00"
        ]
      },
      "id": "d4e13b60-9db2-4d65-aaf4-000000000304"
    }
  ]
}
$manifest$::jsonb;
  ws uuid := '58fcedac-9b26-48b3-bf12-98af3f6c9b27';
  entry jsonb; item jsonb; brief jsonb; item_ids uuid[]; snapshot jsonb; selection jsonb;
  name_count integer; before_hash text; after_hash text; existing jsonb; seed_ids uuid[];
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(ws::text || ':demo-enrichment-v1',0));
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id=ws AND name='demo') THEN
    RAISE EXCEPTION 'SEED_WORKSPACE_TARGET_MISMATCH';
  END IF;
  SELECT array_agg((x->>'id')::uuid) INTO seed_ids FROM (
    SELECT value x FROM jsonb_array_elements(manifest->'outfits')
    UNION ALL SELECT value FROM jsonb_array_elements(manifest->'capsules')
    UNION ALL SELECT jsonb_build_object('id',value->>'draftId') FROM jsonb_array_elements(manifest->'outfits')
  ) identities;

  SELECT jsonb_build_object(
    'wardrobe',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.wardrobe_items t WHERE workspace_id=ws),'[]'),
    'assets',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.assets t WHERE workspace_id=ws),'[]'),
    'preferences',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY workspace_id) FROM public.user_preferences t WHERE workspace_id=ws),'[]'),
    'operations',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.workflow_operations t WHERE workspace_id=ws),'[]'),
    'saved',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.saved_look_snapshots t WHERE workspace_id=ws AND NOT id=ANY(seed_ids)),'[]'),
    'capsules',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.capsules t WHERE workspace_id=ws AND NOT id=ANY(seed_ids)),'[]'),
    'drafts',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.workflow_drafts t WHERE workspace_id=ws AND NOT id=ANY(seed_ids)),'[]')
  ) INTO existing;
  before_hash := md5(existing::text);

  FOR entry IN SELECT value FROM jsonb_array_elements(manifest->'outfits') LOOP
    SELECT array_agg((x->>'id')::uuid ORDER BY ord) INTO item_ids
      FROM jsonb_array_elements(entry->'items') WITH ORDINALITY parts(x,ord);
    IF cardinality(item_ids)<>(SELECT count(DISTINCT x) FROM unnest(item_ids)x) THEN
      RAISE EXCEPTION 'SEED_DUPLICATE_ITEM';
    END IF;
    SELECT count(*) INTO name_count FROM jsonb_array_elements(entry->'items') ref
      JOIN public.wardrobe_items w ON w.workspace_id=ws AND w.id=(ref->>'id')::uuid
        AND w.name=ref->>'name' AND w.category=ref->>'category'
      JOIN public.assets a ON a.workspace_id=ws AND a.id=w.asset_id AND a.status='ready' AND a.bucket='wardrobe'
      WHERE w.inventory_status='owned' AND w.archived_at IS NULL;
    IF name_count<>cardinality(item_ids) THEN RAISE EXCEPTION 'SEED_SCOPED_OWNED_ASSET_REQUIRED'; END IF;
    SELECT jsonb_agg(jsonb_build_object(
      'schema_version','fashion-item.v1','id',w.id,'name',w.name,'category',w.category,'subcategory',w.subcategory,
      'description',w.description,'attributes',w.attributes,'provenance',w.provenance,'corrections',w.corrections,
      'confidence',w.confidence,'uncertainty',w.uncertainty,'revision',w.revision,'asset_id',w.asset_id,
      'owned_at_save',true,'inventory_status','owned','source_type',w.source_type,
      'source_reference',jsonb_build_object('kind','wardrobe','id',w.id),'source_label','Sample wardrobe'
    ) ORDER BY array_position(item_ids,w.id)) INTO snapshot
      FROM public.wardrobe_items w WHERE w.workspace_id=ws AND w.id=ANY(item_ids);
    SELECT jsonb_object_agg(
      CASE WHEN w.category='accessory' THEN
        CASE WHEN coalesce(w.subcategory,'') ~* 'bag|tote|clutch|backpack|purse|satchel|duffel|briefcase|crossbody|messenger'
          THEN 'bags' ELSE 'accessories' END ELSE w.category END,w.id::text
    ) INTO selection FROM public.wardrobe_items w WHERE w.workspace_id=ws AND w.id=ANY(item_ids);
    IF (SELECT count(*) FROM jsonb_object_keys(selection))<>cardinality(item_ids) THEN
      RAISE EXCEPTION 'SEED_DUPLICATE_PREVIEW_SLOT';
    END IF;
    INSERT INTO public.workflow_drafts(id,workspace_id,feature_kind,current_step,visited_steps,payload,status)
      VALUES((entry->>'draftId')::uuid,ws,'preview','selection','["selection"]',
        jsonb_build_object('selection',selection,'sourceType','sample','seedVersion',manifest->>'version'),'completed')
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.saved_look_snapshots(id,workspace_id,source_kind,source_revision,title,items,
      rationale,inputs_used,uncertainty,preference_snapshot,source_type,idempotency_key)
      VALUES((entry->>'id')::uuid,ws,'preview',1,entry->>'title',snapshot,
        (entry->>'rationale') || ' Difference: ' || (entry->>'difference'),
        jsonb_build_object('seedVersion',manifest->>'version','curation','manual sample',
          'signals',jsonb_build_array('Existing owned sample wardrobe only','No personal preferences used'),
          'evidenceItemIds',to_jsonb(item_ids),
          'studio_source',jsonb_build_object('kind','preview','id',entry->>'draftId','parentId',NULL)),
        jsonb_build_array(entry->>'uncertainty','Curated sample; no AI analysis or avatar generation was performed.'),
        '{}','sample',(manifest->>'version') || ':saved:' || (entry->>'key'))
      ON CONFLICT (workspace_id,idempotency_key) DO NOTHING;
  END LOOP;

  FOR entry IN SELECT value FROM jsonb_array_elements(manifest->'capsules') LOOP
    brief := entry->'brief';
    SELECT array_agg(value::uuid ORDER BY ord) INTO item_ids
      FROM jsonb_array_elements_text(brief->'includedItemIds') WITH ORDINALITY parts(value,ord);
    IF NOT EXISTS(SELECT 1 FROM public.capsules WHERE workspace_id=ws AND id=(entry->>'id')::uuid) THEN
      PERFORM public.save_capsule_draft(ws,(entry->>'id')::uuid,0,entry->>'title',brief,item_ids);
    END IF;
  END LOOP;

  SELECT jsonb_build_object(
    'wardrobe',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.wardrobe_items t WHERE workspace_id=ws),'[]'),
    'assets',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.assets t WHERE workspace_id=ws),'[]'),
    'preferences',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY workspace_id) FROM public.user_preferences t WHERE workspace_id=ws),'[]'),
    'operations',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.workflow_operations t WHERE workspace_id=ws),'[]'),
    'saved',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.saved_look_snapshots t WHERE workspace_id=ws AND NOT id=ANY(seed_ids)),'[]'),
    'capsules',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.capsules t WHERE workspace_id=ws AND NOT id=ANY(seed_ids)),'[]'),
    'drafts',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.workflow_drafts t WHERE workspace_id=ws AND NOT id=ANY(seed_ids)),'[]')
  )::text INTO after_hash;
  IF md5(after_hash)<>before_hash THEN RAISE EXCEPTION 'SEED_EXISTING_DATA_CHANGED'; END IF;
END;
$enrich$;
COMMIT;
