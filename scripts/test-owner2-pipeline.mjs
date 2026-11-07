import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  api,
  client,
  owner2Workspace,
  startTestServer,
} from "./owner2-test-utils.mjs";

const workspaceId = await owner2Workspace();
const server = await startTestServer(workspaceId);
const artifacts = {
  lookId: null,
  draftId: null,
  assetIds: [],
  wardrobeIds: [],
  operationIds: [],
  storagePaths: [],
  phases: [],
  retained: true,
};
const originalPreferences = data(
  await api(server.base, "/api/preferences"),
  "read_preferences",
);
const originalProfile = data(
  await api(server.base, "/api/profile"),
  "read_profile",
);
const evidencePath = new URL("../.next/owner2-e2e.json", import.meta.url);
let completed = false;

function data(response, label) {
  if (response.status !== 200 || !response.data)
    throw new Error(
      `${label}: HTTP ${response.status} ${response.error?.code ?? "missing_data"}`,
    );
  return response.data;
}

function recordEvidence(errorCode) {
  if (errorCode) artifacts.errorCode = errorCode;
  mkdirSync(new URL("../.next", import.meta.url), { recursive: true });
  const safe = {
    suite: "owner2_live_pipeline",
    completed,
    model: "gpt-6-luna",
    wardrobeSource: "explicit_sample",
    marketplaceIntegration: "pending",
    lookId: artifacts.lookId,
    draftId: artifacts.draftId,
    assetIds: artifacts.assetIds,
    wardrobeIds: artifacts.wardrobeIds,
    operationIds: artifacts.operationIds,
    phases: artifacts.phases,
    retained: artifacts.retained,
    ...(artifacts.errorCode ? { errorCode: artifacts.errorCode } : {}),
  };
  writeFileSync(evidencePath, JSON.stringify(safe, null, 2));
}

async function fixtureImage(fileName) {
  const bytes = readFileSync(
    new URL(`../public/design/images/${fileName}`, import.meta.url),
  );
  const id = randomUUID();
  const path = `${workspaceId}/${id}/${randomUUID()}.webp`;
  const inserted = await client.from("assets").insert({
    id,
    workspace_id: workspaceId,
    bucket: "wardrobe",
    storage_path: path,
    mime_type: "image/webp",
    byte_size: bytes.byteLength,
    source_type: "sample",
    status: "pending",
  });
  assert.ifError(inserted.error);
  artifacts.assetIds.push(id);
  artifacts.storagePaths.push({ bucket: "wardrobe", path });
  const uploaded = await client.storage
    .from("wardrobe")
    .upload(path, bytes, { contentType: "image/webp", upsert: false });
  assert.ifError(uploaded.error);
  const ready = await client
    .from("assets")
    .update({ status: "ready" })
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  assert.ifError(ready.error);
  return id;
}

async function seedWardrobe() {
  const ivoryAsset = await fixtureImage("wardrobe-ivory-shirt.webp");
  const trousersAsset = await fixtureImage("wardrobe-charcoal-trousers.webp");
  const loaferAsset = await fixtureImage("wardrobe-dark-loafers.webp");
  const fixture = (name, category, subcategory, attributes, options = {}) => ({
    id: randomUUID(),
    workspace_id: workspaceId,
    name,
    category,
    subcategory,
    description: `Explicit synthetic test inventory: ${name.toLowerCase()}.`,
    attributes,
    inferred_attributes: {},
    corrections: {},
    provenance: Object.fromEntries(
      Object.keys(attributes).map((key) => [
        `attributes.${key}`,
        {
          source: "sample",
          state: "reported",
          confidence: null,
          evidence: "Synthetic wardrobe fixture; not a live inventory import.",
          uncertainty: "Example inventory only.",
        },
      ]),
    ),
    uncertainty: ["Synthetic wardrobe fixture."],
    confidence: null,
    source_type: "sample",
    inventory_status: "owned",
    ...options,
  });
  const fixtures = [
    fixture("Light blue ribbed mockneck knit", "top", "sweater", {
      primaryColor: "light blue",
      colors: ["light blue"],
      pattern: "solid",
      texture: "ribbed",
      neckline: "mockneck",
      sleeve: "long",
      fit: "regular",
      functionalFamily: "everyday",
      constructionFamily: "knit",
      apparentMaterial: "wool-like",
      formality: "smart casual",
      silhouette: "straight",
    }),
    fixture("Brown checked tailored blazer", "outerwear", "blazer", {
      primaryColor: "brown",
      colors: ["brown", "cream", "black"],
      pattern: "check",
      lapel: "notched",
      sleeve: "long",
      fit: "relaxed",
      functionalFamily: "tailoring",
      constructionFamily: "tailored",
      formality: "smart casual",
      length: "hip",
      silhouette: "straight",
    }),
    fixture("Brown high-waisted trousers", "bottom", "trousers", {
      primaryColor: "brown",
      colors: ["brown"],
      pattern: "solid",
      rise: "high",
      fit: "regular",
      silhouette: "straight",
      functionalFamily: "tailoring",
      constructionFamily: "woven",
      apparentMaterial: "suede-like",
      formality: "smart casual",
    }),
    fixture(
      "Ivory relaxed shirt",
      "top",
      "shirt",
      {
        primaryColor: "ivory",
        colors: ["ivory"],
        pattern: "solid",
        fit: "relaxed",
        functionalFamily: "everyday",
        constructionFamily: "woven",
        formality: "smart casual",
        collar: "pointed",
      },
      { asset_id: ivoryAsset },
    ),
    fixture(
      "Charcoal tailored trousers",
      "bottom",
      "trousers",
      {
        primaryColor: "charcoal",
        colors: ["charcoal"],
        pattern: "solid",
        rise: "high",
        fit: "regular",
        functionalFamily: "tailoring",
        constructionFamily: "woven",
        formality: "smart casual",
        silhouette: "straight",
      },
      { asset_id: trousersAsset },
    ),
    fixture(
      "Dark flat loafers",
      "shoes",
      "loafers",
      {
        primaryColor: "black",
        colors: ["black"],
        pattern: "solid",
        shoeType: "loafers",
        toeShape: "rounded",
        heelHeightClass: "flat",
        functionalFamily: "everyday",
        constructionFamily: "leather-like",
        formality: "smart casual",
      },
      { asset_id: loaferAsset },
    ),
    fixture("Light blue football jersey", "top", "sports jersey", {
      primaryColor: "light blue",
      colors: ["light blue"],
      functionalFamily: "sports_uniform",
      constructionFamily: "performance mesh",
      formality: "activity-specific",
    }),
    fixture("Football cleats", "shoes", "cleats", {
      primaryColor: "black",
      colors: ["black"],
      shoeType: "cleats",
      soleType: "studs",
      functionalFamily: "sports_uniform",
      activitySpecialization: "football",
      formality: "activity-specific",
    }),
    fixture(
      "Candidate ivory shirt",
      "top",
      "shirt",
      { primaryColor: "ivory", functionalFamily: "everyday" },
      { inventory_status: "saved_candidate" },
    ),
    fixture(
      "Archived knit top",
      "top",
      "sweater",
      { primaryColor: "light blue", functionalFamily: "everyday" },
      { archived_at: new Date().toISOString() },
    ),
  ];
  const inserted = await client.from("wardrobe_items").insert(fixtures);
  assert.ifError(inserted.error);
  artifacts.wardrobeIds.push(...fixtures.map((item) => item.id));
  return fixtures;
}

async function prepareOperation(kind) {
  const operation = data(
    await api(
      server.base,
      `/api/workflow-drafts/${artifacts.draftId}/operations`,
      "POST",
      { kind, inventoryMode: "sample", execute: false },
    ),
    `prepare_${kind}`,
  );
  if (!artifacts.operationIds.includes(operation.id))
    artifacts.operationIds.push(operation.id);
  recordEvidence();
  return operation;
}

async function executeOperation(operation, kind) {
  const started = performance.now();
  const finished = data(
    await api(
      server.base,
      `/api/workflow-operations/${operation.id}/execute`,
      "POST",
      {},
    ),
    `execute_${kind}`,
  );
  if (finished.status !== "succeeded")
    throw new Error(
      `${kind}: ${finished.status} ${finished.errorCode ?? finished.safeErrorCode ?? "operation_failed"}`,
    );
  artifacts.phases.push({
    kind,
    operationId: finished.id,
    durationMs: Math.round(performance.now() - started),
    attemptCount: finished.attemptCount,
    model: finished.model,
    promptVersion: finished.promptVersion,
    schemaVersion: finished.schemaVersion,
    metadata: finished.resultRef?.metadata ?? null,
  });
  recordEvidence();
  console.log(
    JSON.stringify({
      phase: kind,
      status: "succeeded",
      operationId: finished.id,
      durationMs: Math.round(performance.now() - started),
    }),
  );
  return finished;
}

async function cleanup() {
  const scoped = (table) =>
    client.from(table).delete().eq("workspace_id", workspaceId);
  if (artifacts.lookId) {
    const optionRows = await client
      .from("outfit_options")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("look_id", artifacts.lookId);
    assert.ifError(optionRows.error);
    const optionIds = optionRows.data.map((option) => option.id);
    const opRows = await client
      .from("workflow_operations")
      .select("id")
      .eq("workspace_id", workspaceId)
      .in("subject_id", [artifacts.lookId, ...optionIds]);
    assert.ifError(opRows.error);
    const opIds = [
      ...new Set([
        ...artifacts.operationIds,
        ...opRows.data.map((op) => op.id),
      ]),
    ];
    if (opIds.length) {
      assert.ifError(
        (await scoped("workflow_operation_events").in("operation_id", opIds))
          .error,
      );
      assert.ifError(
        (await scoped("workflow_operations").in("id", opIds)).error,
      );
    }
    for (const table of [
      "outfit_option_items",
      "outfit_options",
      "wardrobe_matches",
      "look_reviews",
      "inspiration_pieces",
    ])
      assert.ifError(
        (await scoped(table).eq("look_id", artifacts.lookId)).error,
      );
  }
  if (artifacts.draftId)
    assert.ifError(
      (await scoped("workflow_drafts").eq("id", artifacts.draftId)).error,
    );
  if (artifacts.lookId)
    assert.ifError((await scoped("looks").eq("id", artifacts.lookId)).error);
  if (artifacts.wardrobeIds.length)
    assert.ifError(
      (await scoped("wardrobe_items").in("id", artifacts.wardrobeIds)).error,
    );
  for (const entry of artifacts.storagePaths)
    assert.ifError(
      (await client.storage.from(entry.bucket).remove([entry.path])).error,
    );
  if (artifacts.assetIds.length)
    assert.ifError((await scoped("assets").in("id", artifacts.assetIds)).error);
  const preferences = data(
    await api(server.base, "/api/preferences"),
    "cleanup_preferences_read",
  );
  const restored = data(
    await api(server.base, "/api/preferences", "PATCH", {
      expectedRevision: preferences.revision,
      preferences: originalPreferences.preferences,
    }),
    "cleanup_preferences_restore",
  );
  data(
    await api(server.base, "/api/profile", "PATCH", {
      expectedRevision: restored.revision,
      displayName: originalProfile.displayName,
    }),
    "cleanup_profile_restore",
  );
  artifacts.retained = false;
}

try {
  const fixtures = await seedWardrobe();
  const preferences = {
    skinSwatchId: "depth_04",
    skinSwatchHex: "#B9805D",
    undertone: "warm",
    fit: "regular",
    styles: ["smart_tailoring"],
    colorFamilies: ["blue", "brown", "ivory"],
  };
  const savedPreferences = data(
    await api(server.base, "/api/preferences", "PATCH", {
      expectedRevision: originalPreferences.revision,
      preferences,
    }),
    "save_preferences",
  );
  const draft = data(
    await api(server.base, "/api/workflow-drafts", "POST", {
      featureKind: "inspiration",
      payload: { occasion: "smart casual" },
    }),
    "create_inspiration_draft",
  );
  artifacts.draftId = draft.id;
  const image = readFileSync(
    new URL(
      "../assets/inspiration outfit/outfit inspiration hackathon.jpg",
      import.meta.url,
    ),
  );
  const upload = data(
    await api(server.base, "/api/inspiration/uploads", "POST", {
      fileName: "outfit inspiration hackathon.jpg",
      mimeType: "image/jpeg",
      byteSize: image.byteLength,
    }),
    "allocate_upload",
  );
  artifacts.assetIds.push(upload.assetId);
  const uploaded = await fetch(upload.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: image,
  });
  assert.equal(uploaded.ok, true, `signed_upload HTTP ${uploaded.status}`);
  const asset = await client
    .from("assets")
    .select("bucket,storage_path")
    .eq("workspace_id", workspaceId)
    .eq("id", upload.assetId)
    .single();
  assert.ifError(asset.error);
  artifacts.storagePaths.push({
    bucket: asset.data.bucket,
    path: asset.data.storage_path,
  });
  const verified = data(
    await api(
      server.base,
      `/api/inspiration/uploads/${upload.assetId}/verify`,
      "POST",
      {
        draftId: draft.id,
        expectedRevision: draft.revision,
        occasion: "smart casual",
      },
    ),
    "verify_upload",
  );
  artifacts.lookId = verified.lookId;
  recordEvidence();
  const [description, confidence] = await Promise.all([
    prepareOperation("inspiration_description"),
    prepareOperation("inspiration_confidence"),
  ]);
  const independent = await Promise.allSettled([
    executeOperation(description, "inspiration_description"),
    executeOperation(confidence, "inspiration_confidence"),
  ]);
  for (const result of independent)
    if (result.status === "rejected") throw result.reason;
  let look = data(
    await api(server.base, `/api/looks/${artifacts.lookId}`),
    "read_analysis",
  );
  assert.ok(look.pieces.length > 0, "live garment descriptions persisted");
  assert.ok(
    look.confidenceReview?.explanation,
    "independent confidence review persisted",
  );
  assert.equal(look.inspirationImage?.status, "ready");
  const confidenceInputs = look.confidenceReview.explanation.inputsUsed;
  assert.ok(
    confidenceInputs.some((key) =>
      [
        "skinSwatchId",
        "skinSwatchHex",
        "skin_depth",
        "undertone",
        "fit",
        "styles",
        "colorFamilies",
      ].includes(key),
    ),
    "saved preferences appear in actual review evidence",
  );
  assert.equal(
    (
      await client
        .from("user_preferences")
        .select("style_dna")
        .eq("workspace_id", workspaceId)
        .single()
    ).data.style_dna.skinSwatchHex,
    "#B9805D",
  );
  const events = data(
    await api(
      server.base,
      `/api/workflow-operations/${description.id}/events?after=0`,
    ),
    "read_piece_events",
  );
  const eventList = Array.isArray(events) ? events : events.events;
  assert.ok(
    eventList.some((event) => event.type === "piece_completed"),
    "complete garment events persisted",
  );
  const completedEvent = eventList.findIndex(
    (event) => event.type === "completed",
  );
  assert.ok(
    eventList.findIndex((event) => event.type === "piece_completed") <
      completedEvent,
    "piece event precedes final commit event",
  );
  const garmentFields = (piece) => ({
    id: piece.id,
    name: piece.name,
    category: piece.category,
    subcategory: piece.subcategory,
    description: piece.description,
    attributes: piece.attributes,
    observations: piece.observations,
    confidence: piece.confidence,
    uncertainty: piece.uncertainty,
  });
  const editedPieces = look.pieces.map(garmentFields);
  editedPieces[0].name = `Reviewed ${editedPieces[0].name}`.slice(0, 160);
  const correction = data(
    await api(server.base, `/api/looks/${look.id}/pieces`, "PATCH", {
      expectedRevision: look.revision,
      pieces: editedPieces,
    }),
    "save_piece_correction",
  );
  assert.equal(correction.revision, look.revision + 1);
  assert.equal(
    (
      await api(server.base, `/api/looks/${look.id}/pieces`, "PATCH", {
        expectedRevision: look.revision,
        pieces: editedPieces,
      })
    ).status,
    409,
  );
  look = data(
    await api(server.base, `/api/looks/${look.id}`),
    "read_correction",
  );
  assert.equal(look.pieces[0].corrections.name.source, "user");
  const matchOperation = await prepareOperation("wardrobe_match");
  await executeOperation(matchOperation, "wardrobe_match");
  look = data(await api(server.base, `/api/looks/${look.id}`), "read_matches");
  assert.equal(look.matches.length, look.pieces.length);
  const excluded = new Set(
    fixtures
      .filter((item) => item.inventory_status !== "owned" || item.archived_at)
      .map((item) => item.id),
  );
  for (const match of look.matches) {
    assert.ok(
      ["owned_match", "wardrobe_alternative", "missing"].includes(
        match.outcome,
      ),
    );
    assert.ok(match.explanation?.whyThis?.length >= 2);
    if (match.wardrobeItem) {
      assert.equal(excluded.has(match.wardrobeItem.id), false);
      assert.equal(match.wardrobeItem.sourceType, "sample");
    }
  }
  const optionsOperation = await prepareOperation("outfit_options");
  await executeOperation(optionsOperation, "outfit_options");
  look = data(
    await api(server.base, `/api/looks/${look.id}`),
    "read_outfit_options",
  );
  assert.deepEqual(
    look.outfitOptions.map((option) => option.optionType).sort(),
    ["closest", "fresh_alternative", "from_wardrobe"],
  );
  const wardrobeOption = look.outfitOptions.find(
    (option) => option.optionType === "from_wardrobe",
  );
  assert.equal(wardrobeOption.status, "ready");
  assert.ok(
    wardrobeOption.items.every(
      (item) =>
        item.itemKind === "owned" && !excluded.has(item.wardrobeItem.id),
    ),
  );
  for (const option of look.outfitOptions)
    for (const item of option.items) {
      assert.ok(
        item.id && item.slotId,
        "marketplace handoff has committed slot IDs",
      );
      if (item.itemKind === "missing")
        assert.equal(item.missingBrief.schemaVersion, "fashion-item.v1");
    }
  const beforeRegeneration = new Map(
    look.outfitOptions.map((option) => [option.optionType, option.id]),
  );
  const regenerationStarted = performance.now();
  const regeneration = data(
    await api(
      server.base,
      `/api/looks/${look.id}/outfit-options/fresh_alternative/regenerate`,
      "POST",
      {
        expectedRevision: look.revision,
        expectedOptionId: beforeRegeneration.get("fresh_alternative"),
        inventoryMode: "sample",
      },
    ),
    "regenerate_fresh_alternative",
  );
  if (!artifacts.operationIds.includes(regeneration.id))
    artifacts.operationIds.push(regeneration.id);
  const regenerated =
    regeneration.status === "succeeded"
      ? regeneration
      : await executeOperation(regeneration, "option_regeneration");
  assert.equal(regenerated.status, "succeeded");
  if (regeneration.status === "succeeded") {
    artifacts.phases.push({
      kind: "option_regeneration",
      operationId: regenerated.id,
      durationMs: Math.round(performance.now() - regenerationStarted),
      attemptCount: regenerated.attemptCount,
      model: regenerated.model,
      promptVersion: regenerated.promptVersion,
      schemaVersion: regenerated.schemaVersion,
      metadata: regenerated.resultRef?.metadata ?? null,
    });
    recordEvidence();
    console.log(
      JSON.stringify({
        phase: "option_regeneration",
        status: "succeeded",
        operationId: regenerated.id,
      }),
    );
  }
  look = data(
    await api(server.base, `/api/looks/${look.id}`),
    "read_regenerated_options",
  );
  assert.equal(look.outfitOptions.length, 3);
  for (const option of look.outfitOptions)
    assert.equal(
      option.id === beforeRegeneration.get(option.optionType),
      option.optionType !== "fresh_alternative",
    );
  const duplicate = await prepareOperation("outfit_options");
  assert.equal(
    duplicate.id,
    optionsOperation.id,
    "same fingerprint reuses persisted operation",
  );
  const named = data(
    await api(server.base, "/api/profile", "PATCH", {
      expectedRevision: savedPreferences.revision,
      displayName: "Owner 2 pipeline fixture",
    }),
    "save_profile",
  );
  assert.ok(named.revision > savedPreferences.revision);
  const samePreferences = data(
    await api(server.base, "/api/preferences"),
    "preferences_after_name",
  );
  assert.equal(samePreferences.fingerprint, savedPreferences.fingerprint);
  const sameOptions = await prepareOperation("outfit_options");
  assert.equal(
    sameOptions.id,
    optionsOperation.id,
    "name-only changes preserve operation fingerprint",
  );
  const reload = data(
    await api(server.base, `/api/looks/${look.id}`),
    "reload_final_look",
  );
  assert.deepEqual(
    reload.outfitOptions.map((option) => option.id),
    look.outfitOptions.map((option) => option.id),
  );
  completed = true;
  recordEvidence();
  console.log(
    JSON.stringify({
      suite: "owner2_live_pipeline",
      completed,
      model: "gpt-6-luna",
      lookId: artifacts.lookId,
      pieceCount: look.pieces.length,
      matchCount: look.matches.length,
      outfitCount: look.outfitOptions.length,
      completedOperations: artifacts.phases.length,
      wardrobeSource: "explicit_sample",
      marketplaceIntegration: "pending",
      retained: true,
      evidence: ".next/owner2-e2e.json",
    }),
  );
} catch (error) {
  recordEvidence(error instanceof Error ? error.message : "pipeline_failed");
  console.error(
    JSON.stringify({
      suite: "owner2_live_pipeline",
      completed: false,
      errorCode: error instanceof Error ? error.message : "pipeline_failed",
      lookId: artifacts.lookId,
      retained: true,
      evidence: ".next/owner2-e2e.json",
    }),
  );
  process.exitCode = 1;
} finally {
  try {
    if (process.env.OWNER2_E2E_CLEANUP === "true") await cleanup();
    recordEvidence();
  } finally {
    server.stop();
  }
}
