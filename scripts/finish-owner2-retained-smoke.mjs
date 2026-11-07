import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

if (process.env.OWNER2_FINISH_RETAINED_SMOKE !== "GO")
  throw new Error("OWNER2_FINISH_RETAINED_SMOKE=GO is required.");
const directory = new URL(
  "../.next/owner2-explicit-analysis/",
  import.meta.url,
);
const counter = fileURLToPath(new URL("provider-count.txt", directory));
const evidence = JSON.parse(
  readFileSync(new URL("evidence.json", directory), "utf8"),
);
assert.equal(evidence.fixturesRetainedForDiagnosis, true);
assert.ok(Number(readFileSync(counter, "utf8")) < 20);
writeFileSync(
  new URL("evidence-third.json", directory),
  JSON.stringify(evidence, null, 2),
);
process.env.STYLORA_SMOKE_PROVIDER_COUNTER = counter;
process.env.NODE_OPTIONS =
  `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(fileURLToPath(new URL("provider-guard.mjs", directory))).href}`.trim();
const { api, client, owner2Workspace, startTestServer } =
  await import("./owner2-test-utils.mjs");
const workspaceId = await owner2Workspace();
const server = await startTestServer(workspaceId, true, 3102);
const startedAtCount = Number(readFileSync(counter, "utf8"));
const addedWardrobeIds = [];
let preferences;
function data(response, label) {
  assert.equal(
    response.status,
    200,
    `${label}: HTTP ${response.status} ${response.error?.code ?? "request_failed"}`,
  );
  assert.ok(response.data, label);
  return response.data;
}
function record() {
  evidence.providerRequests = Number(readFileSync(counter, "utf8"));
  evidence.repairProviderRequests = evidence.providerRequests - startedAtCount;
  assert.ok(evidence.providerRequests <= 20);
  writeFileSync(
    new URL("evidence-finished.json", directory),
    JSON.stringify(evidence, null, 2),
  );
}
async function cleanup() {
  const scoped = (table) =>
    client.from(table).delete().eq("workspace_id", workspaceId);
  for (const table of [
    "outfit_option_items",
    "outfit_options",
    "wardrobe_matches",
    "look_reviews",
    "inspiration_pieces",
  ])
    assert.ifError((await scoped(table).eq("look_id", evidence.lookId)).error);
  for (const id of [evidence.draftId, evidence.wardrobeDraftId].filter(Boolean))
    assert.ifError((await scoped("workflow_drafts").eq("id", id)).error);
  assert.ifError((await scoped("looks").eq("id", evidence.lookId)).error);
  for (const ids of [evidence.fixtureItemIds, addedWardrobeIds])
    if (ids.length)
      assert.ifError((await scoped("wardrobe_items").in("id", ids)).error);
  if (evidence.assetIds.length) {
    const assets = await client
      .from("assets")
      .select("id,bucket,storage_path")
      .eq("workspace_id", workspaceId)
      .in("id", evidence.assetIds);
    assert.ifError(assets.error);
    for (const asset of assets.data) {
      assert.ok(asset.storage_path.startsWith(`${workspaceId}/${asset.id}/`));
      assert.ifError(
        (await client.storage.from(asset.bucket).remove([asset.storage_path]))
          .error,
      );
      assert.ifError((await scoped("assets").eq("id", asset.id)).error);
    }
  }
  evidence.cleanup = true;
  evidence.fixturesRetainedForDiagnosis = false;
}
try {
  preferences = data(
    await api(server.base, "/api/preferences"),
    "original_preferences",
  );
  const matchingId = evidence.phases.find(
    (phase) => phase.kind === "wardrobe_match" && phase.status === "succeeded",
  ).operationId;
  const matching = await client
    .from("workflow_operations")
    .select("input")
    .eq("workspace_id", workspaceId)
    .eq("id", matchingId)
    .single();
  assert.ifError(matching.error);
  const captured = matching.data.input.preferenceData;
  assert.ok(
    captured &&
      captured.styleDna &&
      captured.bodyProfile &&
      captured.fitPreferences,
  );
  const snapshotPreferences = {
    ...captured.styleDna,
    ...captured.bodyProfile,
    ...captured.fitPreferences,
  };
  delete snapshotPreferences.skin_depth;
  const selected = data(
    await api(server.base, "/api/preferences", "PATCH", {
      expectedRevision: preferences.revision,
      preferences: snapshotPreferences,
    }),
    "captured_preferences",
  );
  assert.equal(selected.fingerprint, matching.data.input.preferenceFingerprint);
  const before = data(
    await api(server.base, `/api/looks/${evidence.lookId}`),
    "retained_look",
  );
  assert.equal(
    before.matches.filter(
      (match) => !match.stale && match.inventoryMode === "combined",
    ).length,
    before.pieces.length,
  );
  const operation = data(
    await api(
      server.base,
      `/api/workflow-drafts/${evidence.draftId}/operations`,
      "POST",
      { kind: "outfit_options", inventoryMode: "combined", execute: false },
    ),
    "prepare_outfits",
  );
  evidence.operationIds.push(operation.id);
  const result = data(
    await api(
      server.base,
      `/api/workflow-operations/${operation.id}/execute`,
      "POST",
      {},
    ),
    "execute_outfits",
  );
  evidence.phases.push({
    kind: "outfit_options_repair",
    operationId: result.id,
    status: result.status,
    model: result.model,
    promptVersion: result.promptVersion,
    schemaVersion: result.schemaVersion,
    metadata: result.resultRef?.metadata ?? null,
    safeMessage: result.resultRef?.safeMessage ?? null,
    providerDiagnostic: result.resultRef?.provider ?? null,
  });
  record();
  assert.equal(
    result.status,
    "succeeded",
    `outfits: ${result.errorCode ?? result.status}`,
  );
  const look = data(
    await api(server.base, `/api/looks/${evidence.lookId}`),
    "final_look",
  );
  const options = look.outfitOptions.filter(
    (option) => !option.stale && option.inventoryMode === "combined",
  );
  assert.deepEqual(options.map((option) => option.optionType).sort(), [
    "closest",
    "fresh_alternative",
    "from_wardrobe",
  ]);
  for (const option of options) {
    assert.ok(option.explanation.whyThis.length >= 2);
    if (option.optionType === "from_wardrobe" && option.status === "ready")
      assert.ok(option.items.every((item) => item.itemKind === "owned"));
  }
  const providerCount = Number(readFileSync(counter, "utf8"));
  data(
    await api(server.base, `/api/looks/${evidence.lookId}`),
    "reload_results",
  );
  assert.equal(Number(readFileSync(counter, "utf8")), providerCount);
  evidence.optionStatuses = options.map((option) => ({
    type: option.optionType,
    status: option.status,
  }));

  if (process.env.OWNER2_SMOKE_WARDROBE_AI === "true") {
    const draft = data(
      await api(
        server.base,
        `/api/wardrobe/drafts/${evidence.wardrobeDraftId}`,
      ),
      "wardrobe_ready_draft",
    );
    assert.ok(draft.assetId && draft.payload.metadata.occasion.trim());
    const started = data(
      await api(
        server.base,
        `/api/wardrobe/drafts/${draft.id}/analyze`,
        "POST",
        { expectedRevision: draft.revision },
      ),
      "wardrobe_analysis_allocate",
    );
    evidence.operationIds.push(started.id);
    const response = await fetch(
      `${server.base}/api/wardrobe/operations/${started.id}/run`,
      { method: "POST" },
    );
    assert.equal(response.ok, true, "wardrobe_runner_http");
    const messages = (await response.text())
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const completed = messages.find((message) => message.type === "complete");
    assert.equal(
      completed?.data.operation.status,
      "succeeded",
      "wardrobe_description_complete",
    );
    const analyzed = completed.data.draft;
    assert.ok(analyzed.payload.proposals.length);
    const proposal = analyzed.payload.proposals[0];
    const saved = data(
      await api(
        server.base,
        `/api/wardrobe/drafts/${draft.id}/confirm`,
        "POST",
        {
          expectedRevision: analyzed.revision,
          proposalId: proposal.id,
          values: proposal.values,
        },
      ),
      "wardrobe_confirm_real_item",
    );
    assert.ok(saved.itemId);
    addedWardrobeIds.push(saved.itemId);
    const owned = await client
      .from("wardrobe_items")
      .select("id,source_type,inventory_status,asset_id,provenance")
      .eq("workspace_id", workspaceId)
      .eq("id", saved.itemId)
      .single();
    assert.ifError(owned.error);
    assert.equal(owned.data.inventory_status, "owned");
    assert.equal(owned.data.source_type, "live");
    assert.ok(owned.data.asset_id && Object.keys(owned.data.provenance).length);
    const diagnostics = await client
      .from("workflow_operations")
      .select("model,prompt_version,result_ref")
      .eq("workspace_id", workspaceId)
      .eq("id", started.id)
      .single();
    assert.ifError(diagnostics.error);
    evidence.phases.push({
      kind: "wardrobe_photo_occasion_analysis_and_confirm",
      operationId: started.id,
      status: "succeeded",
      model: diagnostics.data.model,
      promptVersion: diagnostics.data.prompt_version,
      metadata: {
        usage: analyzed.payload.metadata.usage ?? null,
        requestId: analyzed.payload.metadata.requestId ?? null,
        promptAssemblyHash:
          analyzed.payload.metadata.promptAssemblyHash ?? null,
      },
    });
  }
  evidence.resolvedFailures = [
    ...(evidence.resolvedFailures ?? []),
    evidence.failure,
  ];
  delete evidence.failure;
  evidence.completed = true;
} catch (error) {
  evidence.repairFailure =
    error instanceof Error ? error.message.split("\n")[0] : "repair_failed";
  evidence.cleanup = false;
  evidence.addedWardrobeIds = addedWardrobeIds;
  process.exitCode = 1;
} finally {
  try {
    if (preferences) {
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
      assert.equal(restored.fingerprint, preferences.fingerprint);
      evidence.preferencesRestored = true;
    }
    if (
      evidence.completed &&
      process.env.OWNER2_SMOKE_RETAIN_FIXTURES !== "true"
    )
      await cleanup();
  } catch {
    evidence.cleanupError = "cleanup_or_preferences_restore_failed";
    process.exitCode = 1;
  }
  record();
  server.stop();
  console.log(
    JSON.stringify({
      suite: "retained_pipeline_finish",
      completed: evidence.completed,
      globalProviderRequests: evidence.providerRequests,
      cleanup: evidence.cleanup,
      preferencesRestored: evidence.preferencesRestored,
      ...(evidence.repairFailure ? { failure: evidence.repairFailure } : {}),
      evidence: ".next/owner2-explicit-analysis/evidence-finished.json",
    }),
  );
}
