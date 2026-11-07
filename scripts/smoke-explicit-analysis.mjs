import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

if (process.env.OWNER2_EXPLICIT_ANALYSIS_SMOKE !== "GO")
  throw new Error(
    "Set OWNER2_EXPLICIT_ANALYSIS_SMOKE=GO after stopping the shared dev server.",
  );

const directory = new URL(
  "../.next/owner2-explicit-analysis/",
  import.meta.url,
);
mkdirSync(directory, { recursive: true });
const counter = fileURLToPath(new URL("provider-count.txt", directory));
const guard = new URL("provider-guard.mjs", directory);
const continueBudget = process.env.OWNER2_SMOKE_CONTINUE_BUDGET === "true";
if (continueBudget) {
  assert.ok(
    existsSync(counter),
    "continuation requires the existing provider counter",
  );
} else {
  if (existsSync(counter))
    assert.equal(
      Number(readFileSync(counter, "utf8")),
      0,
      "existing spent budget requires OWNER2_SMOKE_CONTINUE_BUDGET=true",
    );
  writeFileSync(counter, "0");
}
const providerRequestsAtStart = Number(readFileSync(counter, "utf8"));
assert.ok(
  Number.isInteger(providerRequestsAtStart) &&
    providerRequestsAtStart >= 0 &&
    providerRequestsAtStart < 20,
  "provider_budget_available",
);
writeFileSync(
  guard,
  `
import {mkdirSync,readFileSync,writeFileSync,rmdirSync} from 'node:fs';
const original=globalThis.fetch.bind(globalThis);
const counter=process.env.STYLORA_SMOKE_PROVIDER_COUNTER;
if(!counter)throw new Error('smoke_budget_counter_missing');
globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.hostname==='api.openai.com'){
    const lock=counter+'.lock';let acquired=false;
    for(let attempt=0;attempt<200;attempt++){
      try{mkdirSync(lock);acquired=true;break;}catch(error){if(error.code!=='EEXIST')throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5);}
    }
    if(!acquired)throw new Error('smoke_budget_lock_unavailable');
    try{const count=Number(readFileSync(counter,'utf8'));if(!Number.isInteger(count)||count<0||count>=20)throw new Error('smoke_provider_budget_exhausted');writeFileSync(counter,String(count+1));}finally{rmdirSync(lock);}
  }
  return original(input,init);
};
`,
);
process.env.STYLORA_SMOKE_PROVIDER_COUNTER = counter;
process.env.NODE_OPTIONS =
  `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(fileURLToPath(guard)).href}`.trim();
const { api, client, localEnv, owner2Workspace, startTestServer } =
  await import("./owner2-test-utils.mjs");
const workspaceId = await owner2Workspace();
const server = await startTestServer(workspaceId, true, 3102);
const evidence = {
  suite: "explicit_analysis",
  workspace: "dev-owner-2",
  completed: false,
  maxProviderRequests: 20,
  providerRequestsAtStart,
  providerRequests: 0,
  phases: [],
  fixtureItemIds: [],
  operationIds: [],
  cleanup: false,
  operationAccountingRetained: true,
};
const assets = [];
let draftId;
let wardrobeDraftId;
let lookId;
let preferences;
let preferencesChanged = false;

function data(response, phase) {
  assert.equal(
    response.status,
    200,
    `${phase}: HTTP ${response.status} ${response.error?.code ?? "invalid_response"}`,
  );
  assert.ok(response.data, `${phase}: missing_data`);
  return response.data;
}
function saveEvidence() {
  evidence.providerRequests = Number(readFileSync(counter, "utf8"));
  evidence.providerRequestsThisRun =
    evidence.providerRequests - providerRequestsAtStart;
  assert.ok(evidence.providerRequests <= 20, "provider_budget_guard");
  evidence.lookId = lookId;
  evidence.draftId = draftId;
  evidence.wardrobeDraftId = wardrobeDraftId;
  evidence.assetIds = assets.map((asset) => asset.id);
  writeFileSync(
    new URL("evidence.json", directory),
    JSON.stringify(evidence, null, 2),
  );
}
async function rememberAsset(id) {
  const result = await client
    .from("assets")
    .select("id,bucket,storage_path")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .single();
  assert.ifError(result.error);
  assets.push(result.data);
}
async function zeroOperations(subjectId) {
  const result = await client
    .from("workflow_operations")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("subject_id", subjectId);
  assert.ifError(result.error);
  assert.equal(
    result.count,
    0,
    "upload must not allocate an analysis operation",
  );
  assert.equal(
    Number(readFileSync(counter, "utf8")),
    providerRequestsAtStart,
    "upload must not call a provider",
  );
}
async function prepare(kind) {
  const operation = data(
    await api(
      server.base,
      `/api/workflow-drafts/${draftId}/operations`,
      "POST",
      { kind, inventoryMode: "combined", execute: false },
    ),
    `prepare_${kind}`,
  );
  if (!evidence.operationIds.includes(operation.id))
    evidence.operationIds.push(operation.id);
  return operation;
}
async function execute(operation, kind) {
  const started = performance.now();
  const result = data(
    await api(
      server.base,
      `/api/workflow-operations/${operation.id}/execute`,
      "POST",
      {},
    ),
    `execute_${kind}`,
  );
  const metadata = result.resultRef?.metadata;
  evidence.phases.push({
    kind,
    status: result.status,
    operationId: result.id,
    model: result.model,
    promptVersion: result.promptVersion,
    schemaVersion: result.schemaVersion,
    promptAssemblyHash: metadata?.promptAssemblyHash ?? null,
    promptSourceHash: metadata?.promptSourceHash ?? null,
    knowledgeSourceHash: metadata?.knowledgeSourceHash ?? null,
    usage: metadata?.usage ?? null,
    requestId: metadata?.requestId ?? null,
    durationMs: Math.round(performance.now() - started),
  });
  saveEvidence();
  assert.equal(
    result.status,
    "succeeded",
    `${kind}: ${result.errorCode ?? result.status}`,
  );
  console.log(
    JSON.stringify({
      phase: kind,
      status: result.status,
      providerRequests: evidence.providerRequests,
    }),
  );
}

async function cleanup() {
  const scoped = (table) =>
    client.from(table).delete().eq("workspace_id", workspaceId);
  if (evidence.completed) {
    if (lookId) {
      for (const table of [
        "outfit_option_items",
        "outfit_options",
        "wardrobe_matches",
        "look_reviews",
        "inspiration_pieces",
      ])
        assert.ifError((await scoped(table).eq("look_id", lookId)).error);
    }
    for (const id of [draftId, wardrobeDraftId].filter(Boolean))
      assert.ifError((await scoped("workflow_drafts").eq("id", id)).error);
    if (lookId) assert.ifError((await scoped("looks").eq("id", lookId)).error);
    if (evidence.fixtureItemIds.length)
      assert.ifError(
        (await scoped("wardrobe_items").in("id", evidence.fixtureItemIds))
          .error,
      );
    for (const asset of assets) {
      assert.ifError(
        (await client.storage.from(asset.bucket).remove([asset.storage_path]))
          .error,
      );
      assert.ifError((await scoped("assets").eq("id", asset.id)).error);
    }
  }
  if (preferencesChanged) {
    const current = data(
      await api(server.base, "/api/preferences"),
      "restore_preferences_read",
    );
    const restored = data(
      await api(server.base, "/api/preferences", "PATCH", {
        expectedRevision: current.revision,
        preferences: preferences.preferences,
      }),
      "restore_preferences",
    );
    assert.equal(
      restored.fingerprint,
      preferences.fingerprint,
      "original_preferences_restored",
    );
    evidence.preferencesRestored = true;
  }
  evidence.cleanup = evidence.completed;
  evidence.fixturesRetainedForDiagnosis = !evidence.completed;
}

try {
  preferences = data(
    await api(server.base, "/api/preferences"),
    "preferences_read",
  );
  data(
    await api(server.base, "/api/preferences", "PATCH", {
      expectedRevision: preferences.revision,
      preferences: {
        ...preferences.preferences,
        undertone: "warm",
        fit: "relaxed",
      },
    }),
    "preferences_fixture",
  );
  preferencesChanged = true;
  let image;
  let mimeType;
  const sourceLookId = process.env.OWNER2_SMOKE_SOURCE_LOOK_ID;
  if (sourceLookId) {
    assert.match(sourceLookId, /^[a-f0-9-]{36}$/i);
    const source = await client
      .from("looks")
      .select("inspiration_asset_id")
      .eq("workspace_id", localEnv.STYLORA_WORKSPACE_ID)
      .eq("id", sourceLookId)
      .single();
    assert.ifError(source.error);
    const asset = await client
      .from("assets")
      .select("bucket,storage_path,mime_type")
      .eq("workspace_id", localEnv.STYLORA_WORKSPACE_ID)
      .eq("id", source.data.inspiration_asset_id)
      .single();
    assert.ifError(asset.error);
    const downloaded = await client.storage
      .from(asset.data.bucket)
      .download(asset.data.storage_path);
    assert.ifError(downloaded.error);
    image = Buffer.from(await downloaded.data.arrayBuffer());
    mimeType = asset.data.mime_type;
    evidence.fixtureSource = "existing_origin_workspace_asset_read_only";
    evidence.sourceLookId = sourceLookId;
  } else {
    image = readFileSync(
      new URL(
        "../assets/inspiration outfit/outfit inspiration hackathon.jpg",
        import.meta.url,
      ),
    );
    mimeType = "image/jpeg";
    evidence.fixtureSource = "user_supplied_jpeg";
  }
  evidence.fixtureHash = createHash("sha256").update(image).digest("hex");
  const draft = data(
    await api(server.base, "/api/workflow-drafts", "POST", {
      featureKind: "inspiration",
      payload: {},
    }),
    "create_draft",
  );
  draftId = draft.id;
  const upload = data(
    await api(server.base, "/api/inspiration/uploads", "POST", {
      fileName: "explicit-analysis-photo",
      mimeType,
      byteSize: image.byteLength,
    }),
    "signed_upload",
  );
  await rememberAsset(upload.assetId);
  assert.ok(
    (
      await fetch(upload.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: image,
      })
    ).ok,
    "storage_upload",
  );
  const verified = data(
    await api(
      server.base,
      `/api/inspiration/uploads/${upload.assetId}/verify`,
      "POST",
      { draftId, expectedRevision: draft.revision, occasion: null },
    ),
    "verify_upload",
  );
  lookId = verified.lookId;
  await zeroOperations(lookId);
  const blockedCreate = await api(
    server.base,
    `/api/workflow-drafts/${draftId}/operations`,
    "POST",
    {
      kind: "inspiration_description",
      inventoryMode: "combined",
      execute: false,
    },
  );
  assert.equal(
    blockedCreate.status,
    409,
    "empty occasion must prevent operation allocation",
  );
  await zeroOperations(lookId);
  data(
    await api(server.base, `/api/looks/${lookId}/context`, "PATCH", {
      expectedRevision: verified.revision,
      occasion: "smart casual",
    }),
    "save_occasion",
  );
  const currentDraft = data(
    await api(server.base, `/api/workflow-drafts/${draftId}`),
    "read_draft_for_occasion",
  );
  data(
    await api(server.base, `/api/workflow-drafts/${draftId}`, "PATCH", {
      expectedRevision: currentDraft.revision,
      payload: { ...currentDraft.payload, occasion: "smart casual" },
    }),
    "save_draft_occasion",
  );
  await api(server.base, `/api/looks/${lookId}`);
  await zeroOperations(lookId);

  const wardrobeDraft = data(
    await api(server.base, "/api/wardrobe/drafts", "POST", {}),
    "wardrobe_draft",
  );
  wardrobeDraftId = wardrobeDraft.id;
  const wardrobeUpload = data(
    await api(server.base, "/api/wardrobe/uploads", "POST", {
      draftId: wardrobeDraftId,
      expectedRevision: wardrobeDraft.revision,
      mimeType,
      byteSize: image.byteLength,
    }),
    "wardrobe_upload",
  );
  await rememberAsset(wardrobeUpload.assetId);
  assert.ok(
    (
      await fetch(wardrobeUpload.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: image,
      })
    ).ok,
    "wardrobe_storage_upload",
  );
  data(
    await api(
      server.base,
      `/api/wardrobe/drafts/${wardrobeDraftId}/verify`,
      "POST",
      {
        assetId: wardrobeUpload.assetId,
        expectedRevision: wardrobeUpload.draft.revision,
      },
    ),
    "wardrobe_verify",
  );
  const restoredWardrobe = data(
    await api(server.base, `/api/wardrobe/drafts/${wardrobeDraftId}/analyze`),
    "wardrobe_restore_status",
  );
  assert.equal(restoredWardrobe.operation, null);
  await zeroOperations(wardrobeDraftId);
  const currentWardrobe = data(
    await api(server.base, `/api/wardrobe/drafts/${wardrobeDraftId}`),
    "wardrobe_restored_draft",
  );
  const blockedWardrobe = await api(
    server.base,
    `/api/wardrobe/drafts/${wardrobeDraftId}/analyze`,
    "POST",
    { expectedRevision: currentWardrobe.revision },
  );
  assert.equal(
    blockedWardrobe.status,
    409,
    "wardrobe occasion must be filled before allocation",
  );
  await zeroOperations(wardrobeDraftId);
  const occasionWardrobe = data(
    await api(server.base, `/api/wardrobe/drafts/${wardrobeDraftId}`, "PATCH", {
      expectedRevision: currentWardrobe.revision,
      proposals: [],
      occasion: "smart casual",
    }),
    "wardrobe_occasion_save",
  );
  assert.equal(occasionWardrobe.payload.metadata.occasion, "smart casual");
  evidence.phases.push({
    kind: "verified_photo_and_occasion_gate",
    status: "passed",
    createOperations: 0,
    wardrobeOperations: 0,
    providerRequestsThisRun: 0,
    globalProviderRequests: providerRequestsAtStart,
  });
  saveEvidence();

  const description = await prepare("inspiration_description");
  const confidence = await prepare("inspiration_confidence");
  assert.equal(
    Number(readFileSync(counter, "utf8")),
    providerRequestsAtStart,
    "allocation alone must not call provider",
  );
  const initial = await Promise.allSettled([
    execute(description, "inspiration_description"),
    execute(confidence, "inspiration_confidence"),
  ]);
  for (const result of initial)
    if (result.status === "rejected") throw result.reason;
  let look = data(
    await api(server.base, `/api/looks/${lookId}`),
    "read_analysis",
  );
  assert.ok(look.pieces.length > 0);
  assert.ok(look.confidenceReview && !look.confidenceReview.stale);
  const fixtures = look.pieces.map((piece) => ({
    id: randomUUID(),
    workspace_id: workspaceId,
    name: piece.name,
    category: piece.category,
    subcategory: piece.subcategory,
    description: piece.description,
    attributes: piece.attributes,
    inferred_attributes: {},
    corrections: {},
    provenance: {},
    confidence: null,
    uncertainty: ["Explicit sample fixture for this smoke test."],
    source_type: "sample",
    inventory_status: "owned",
  }));
  evidence.fixtureItemIds = fixtures.map((item) => item.id);
  assert.ifError((await client.from("wardrobe_items").insert(fixtures)).error);
  await execute(await prepare("wardrobe_match"), "wardrobe_match");
  look = data(await api(server.base, `/api/looks/${lookId}`), "read_matches");
  const matches = look.matches.filter(
    (match) => !match.stale && match.inventoryMode === "combined",
  );
  assert.equal(matches.length, look.pieces.length);
  for (const match of matches)
    if (match.wardrobeItem)
      assert.ok(
        ["live", "manual", "sample"].includes(match.wardrobeItem.sourceType),
      );
  await execute(await prepare("outfit_options"), "outfit_options");
  look = data(await api(server.base, `/api/looks/${lookId}`), "read_options");
  const options = look.outfitOptions.filter(
    (option) => !option.stale && option.inventoryMode === "combined",
  );
  assert.deepEqual(options.map((option) => option.optionType).sort(), [
    "closest",
    "fresh_alternative",
    "from_wardrobe",
  ]);
  for (const option of options)
    for (const item of option.items)
      if (item.itemKind === "owned")
        assert.ok(
          ["live", "manual", "sample"].includes(item.wardrobeItem?.sourceType),
        );
  const wardrobeOption = options.find(
    (option) => option.optionType === "from_wardrobe",
  );
  if (wardrobeOption.status === "ready")
    assert.ok(wardrobeOption.items.every((item) => item.itemKind === "owned"));
  const before = Number(readFileSync(counter, "utf8"));
  data(
    await api(server.base, `/api/looks/${lookId}`),
    "reload_without_inference",
  );
  assert.equal(Number(readFileSync(counter, "utf8")), before);
  evidence.pieceCount = look.pieces.length;
  evidence.matchCount = matches.length;
  evidence.optionStatuses = options.map((option) => ({
    type: option.optionType,
    status: option.status,
  }));
  evidence.completed = true;
} catch (error) {
  evidence.failure =
    error instanceof assert.AssertionError
      ? error.message.split("\n")[0]
      : error instanceof Error
        ? error.message
        : "smoke_failed";
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
  } catch {
    evidence.cleanup = false;
    evidence.cleanupError = "fixture_cleanup_failed";
    process.exitCode = 1;
  }
  saveEvidence();
  server.stop();
  console.log(
    JSON.stringify({
      suite: evidence.suite,
      completed: evidence.completed,
      providerRequests: evidence.providerRequests,
      maxProviderRequests: 20,
      cleanup: evidence.cleanup,
      ...(evidence.failure ? { failure: evidence.failure } : {}),
      evidence: ".next/owner2-explicit-analysis/evidence.json",
    }),
  );
}
