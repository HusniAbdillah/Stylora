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
const evidence = {
  suite: "owner2_frontend_backend_contracts",
  command: "node scripts/smoke-owner2-integration.mjs",
  workspace: "dev-owner-2",
  writesEnabled: true,
  providerCalls: 0,
  frontendTests: false,
  completed: false,
  httpRequests: 0,
  passed: [],
  skipped: [],
  cleanup: [],
};
const created = {
  drafts: [],
  operations: [],
  wardrobe: [],
  look: null,
  asset: null,
};
let server;
let originalPreferences;
let originalProfile;
let phase = "start_backend_server";
let failed = false;
const path = new URL(
  "../.next/owner2-frontend-api-evidence.json",
  import.meta.url,
);

function saveEvidence() {
  mkdirSync(new URL("../.next", import.meta.url), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      { ...evidence, recordedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
}
async function request(route, method = "GET", body, expected = 200) {
  evidence.httpRequests++;
  const response = await api(server.base, route, method, body);
  assert.equal(response.status, expected, `${phase}: unexpected HTTP status`);
  return response.data;
}
function passed(name) {
  evidence.passed.push(name);
}
async function removeRows(table, column, ids) {
  if (!ids.length) return;
  const { error } = await client
    .from(table)
    .delete()
    .eq("workspace_id", workspaceId)
    .in(column, ids);
  assert.ifError(error);
}

try {
  server = await startTestServer(workspaceId, true, 3102);
  phase = "profile_preferences_roundtrip";
  originalPreferences = await request("/api/preferences");
  originalProfile = await request("/api/profile");
  const named = await request("/api/profile", "PATCH", {
    expectedRevision: originalProfile.revision,
    displayName: "Owner 2 API smoke",
  });
  assert.equal(named.displayName, "Owner 2 API smoke", "profile save response");
  const preferences = {
    ...originalPreferences.preferences,
    skinSwatchId: "depth_04",
    skinSwatchHex: "#B9805D",
    undertone: "warm",
    fit: "relaxed",
  };
  const saved = await request("/api/preferences", "PATCH", {
    expectedRevision: named.revision,
    preferences,
  });
  const readPreferences = await request("/api/preferences");
  assert.deepEqual(
    readPreferences.preferences,
    preferences,
    "preferences round-trip",
  );
  assert.equal(
    readPreferences.fingerprint,
    saved.fingerprint,
    "personalization fingerprint round-trip",
  );
  const readProfile = await request("/api/profile");
  assert.equal(
    readProfile.displayName,
    "Owner 2 API smoke",
    "profile round-trip",
  );
  for (const key of ["wardrobeItems", "savedLooks", "capsules", "activeShares"])
    assert.ok(
      Number.isInteger(readProfile.stats[key]) && readProfile.stats[key] >= 0,
      `hosted profile count: ${key}`,
    );
  const counts = await Promise.all([
    client
      .from("wardrobe_items")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("inventory_status", "owned")
      .is("archived_at", null),
    client
      .from("saved_look_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
    client
      .from("capsules")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
    client
      .from("share_links")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);
  for (const [index, key] of [
    "wardrobeItems",
    "savedLooks",
    "capsules",
    "activeShares",
  ].entries()) {
    assert.ifError(counts[index].error);
    assert.equal(
      readProfile.stats[key],
      counts[index].count,
      `actual hosted count: ${key}`,
    );
  }
  const preferenceDraft = await request("/api/workflow-drafts", "POST", {
    featureKind: "preferences",
    payload: preferences,
  });
  created.drafts.push(preferenceDraft.id);
  const restored = await request(`/api/workflow-drafts/${preferenceDraft.id}`);
  assert.deepEqual(restored.payload, preferences, "preference draft restore");
  passed("profile_name_and_preferences_swatch_roundtrip");
  passed("preference_draft_restore");
  passed("profile_statistics_match_hosted_counts");

  phase = "confidence_null_metadata";
  const reviews = await client
    .from("look_reviews")
    .select("look_id,source_revision,input_metadata,source_type")
    .eq("workspace_id", workspaceId)
    .eq("is_current", true)
    .eq("source_type", "live")
    .order("created_at", { ascending: false })
    .limit(20);
  assert.ifError(reviews.error);
  let checkedConfidence = false;
  for (const review of reviews.data) {
    if (review.input_metadata?.inventoryFingerprint !== null) continue;
    const look = await client
      .from("looks")
      .select("id,revision,source_type")
      .eq("workspace_id", workspaceId)
      .eq("id", review.look_id)
      .single();
    assert.ifError(look.error);
    if (
      look.data.revision !== review.source_revision ||
      look.data.source_type !== "live"
    )
      continue;
    const operations = await client
      .from("workflow_operations")
      .select("input")
      .eq("workspace_id", workspaceId)
      .eq("subject_id", review.look_id)
      .eq("kind", "inspiration_confidence")
      .eq("status", "succeeded")
      .limit(20);
    assert.ifError(operations.error);
    const captured = operations.data.find(
      (operation) =>
        operation.input?.preferenceFingerprint ===
        review.input_metadata.preferenceFingerprint,
    )?.input?.preferenceData;
    if (!captured) continue;
    const capturedPreferences = {
      ...captured.styleDna,
      ...captured.bodyProfile,
      ...captured.fitPreferences,
    };
    delete capturedPreferences.skin_depth;
    const current = await request("/api/preferences");
    await request("/api/preferences", "PATCH", {
      expectedRevision: current.revision,
      preferences: capturedPreferences,
    });
    const projection = await request(`/api/looks/${review.look_id}`);
    assert.equal(
      projection.confidenceReview?.stale,
      false,
      "real review with null inventory metadata remains fresh",
    );
    checkedConfidence = true;
    passed("real_confidence_null_inventory_metadata_freshness");
    break;
  }
  if (!checkedConfidence)
    evidence.skipped.push({
      test: "confidence_null_metadata_freshness",
      reason:
        "No current real review at the unchanged look revision; no inference or invented output was used.",
    });

  phase = "verified_upload_and_manual_piece";
  const draft = await request("/api/workflow-drafts", "POST", {
    featureKind: "inspiration",
    payload: { occasion: "Everyday" },
  });
  created.drafts.push(draft.id);
  const bytes = readFileSync(
    new URL(
      "../assets/inspiration outfit/outfit inspiration hackathon.jpg",
      import.meta.url,
    ),
  );
  const upload = await request("/api/inspiration/uploads", "POST", {
    fileName: "outfit inspiration hackathon.jpg",
    mimeType: "image/jpeg",
    byteSize: bytes.byteLength,
  });
  created.asset = upload.assetId;
  evidence.httpRequests++;
  const put = await fetch(upload.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": upload.mimeType },
    body: bytes,
  });
  assert.ok(put.ok, "private signed storage upload");
  const verified = await request(
    `/api/inspiration/uploads/${upload.assetId}/verify`,
    "POST",
    {
      draftId: draft.id,
      expectedRevision: draft.revision,
      occasion: "Everyday",
    },
  );
  created.look = verified.lookId;
  const piece = {
    name: "Manual API smoke shirt",
    category: "top",
    subcategory: "shirt",
    description: "Explicit manual backend smoke fixture, not AI analysis.",
    attributes: { primaryColor: "ivory", colors: ["ivory"], fit: "relaxed" },
    observations: [],
    confidence: null,
    uncertainty: ["Manual test input."],
  };
  const pieces = await request(`/api/looks/${created.look}/pieces`, "PATCH", {
    expectedRevision: verified.revision,
    pieces: [piece],
  });
  assert.equal(pieces.pieces.length, 1, "manual piece persisted");
  const pieceId = pieces.pieces[0].id;
  const changed = await request(`/api/looks/${created.look}/context`, "PATCH", {
    expectedRevision: pieces.revision,
    occasion: "Work",
  });
  assert.equal(
    changed.revision,
    pieces.revision + 1,
    "occasion revision increments once",
  );
  const reloaded = await request(`/api/looks/${created.look}`);
  assert.equal(reloaded.occasion, "Work", "occasion round-trip");
  assert.equal(
    reloaded.inspirationImage.assetId,
    upload.assetId,
    "occasion preserves verified upload",
  );
  assert.equal(
    reloaded.inspirationImage.status,
    "ready",
    "verified storage readable",
  );
  assert.equal(
    reloaded.pieces[0].id,
    pieceId,
    "occasion preserves piece identity",
  );
  assert.equal(
    reloaded.pieces[0].attributes.primaryColor,
    "ivory",
    "occasion preserves canonical piece attributes",
  );
  await request(
    `/api/looks/${created.look}/context`,
    "PATCH",
    { expectedRevision: pieces.revision, occasion: "Travel" },
    409,
  );
  passed("private_upload_decode_verification_and_manual_piece_persistence");
  passed("occasion_cas_preserves_asset_and_pieces_rejects_stale_revision");
  evidence.fixture = {
    source: "user_provided_jpeg",
    description: "manual_backend_fixture",
    cleanup: "delete_new_fixture_rows_and_private_object",
  };

  phase = "owner1_live_wardrobe_contract_and_matching_allocation";
  const wardrobeId = randomUUID();
  const wardrobeFixture = {
    id: wardrobeId,
    workspace_id: workspaceId,
    name: "Manual live inventory API smoke shirt",
    category: "top",
    subcategory: "shirt",
    description:
      "Temporary manually entered owned inventory for backend integration verification.",
    attributes: { primaryColor: "ivory", colors: ["ivory"], fit: "relaxed" },
    inferred_attributes: {},
    corrections: {},
    provenance: {
      "attributes.primaryColor": {
        source: "user",
        state: "reported",
        confidence: null,
        evidence: "Explicit manual test input.",
        uncertainty: null,
      },
    },
    confidence: null,
    uncertainty: ["Temporary manual test input; no provider analysis."],
    source_type: "manual",
    inventory_status: "owned",
    notes: "Disposable backend smoke fixture.",
  };
  const insertedWardrobe = await client
    .from("wardrobe_items")
    .insert(wardrobeFixture);
  assert.ifError(insertedWardrobe.error);
  created.wardrobe.push(wardrobeId);
  const wardrobeResponse = await request("/api/wardrobe?status=owned");
  const ownedFixture = wardrobeResponse.items.find(
    (item) => item.id === wardrobeId,
  );
  assert.equal(
    ownedFixture?.sourceType,
    "manual",
    "Owner 1 API returns actual manual inventory source",
  );
  assert.equal(
    ownedFixture?.inventoryStatus,
    "owned",
    "Owner 1 API returns owned inventory",
  );
  assert.equal(
    ownedFixture?.attributes.primaryColor,
    "ivory",
    "Owner 1 canonical item attributes",
  );
  const matchingInput = {
    kind: "wardrobe_match",
    inventoryMode: "live",
    execute: false,
  };
  const matchingRoute = `/api/workflow-drafts/${draft.id}/operations`;
  const liveOperation = await request(matchingRoute, "POST", matchingInput);
  created.operations.push(liveOperation.id);
  const sameLiveOperation = await request(matchingRoute, "POST", matchingInput);
  assert.equal(
    sameLiveOperation.id,
    liveOperation.id,
    "live matching allocation deduplicates",
  );
  assert.equal(
    liveOperation.inventoryMode,
    "live",
    "operation projection preserves live inventory mode",
  );
  assert.equal(
    liveOperation.status,
    "queued",
    "live matching remains unexecuted",
  );
  const storedOperation = await client
    .from("workflow_operations")
    .select("input,provider_call_count")
    .eq("workspace_id", workspaceId)
    .eq("id", liveOperation.id)
    .single();
  assert.ifError(storedOperation.error);
  assert.equal(
    storedOperation.data.input.inventoryMode,
    "live",
    "live mode persisted in operation snapshot",
  );
  assert.ok(
    storedOperation.data.input.inventoryState.some(
      (item) => item.id === wardrobeId,
    ),
    "matching snapshot includes actual owned UUID",
  );
  assert.equal(
    storedOperation.data.provider_call_count,
    0,
    "matching allocation spends no provider calls",
  );
  const includedIds = storedOperation.data.input.inventoryState.map(
    (item) => item.id,
  );
  const includedItems = await client
    .from("wardrobe_items")
    .select("id,source_type,inventory_status,archived_at")
    .eq("workspace_id", workspaceId)
    .in("id", includedIds);
  assert.ifError(includedItems.error);
  assert.ok(
    includedItems.data.every(
      (item) =>
        item.source_type !== "sample" &&
        item.inventory_status === "owned" &&
        item.archived_at === null,
    ),
    "live matching excludes sample, candidate and archived rows",
  );
  passed("owner1_wardrobe_api_and_live_inventory_matching_contract");
  passed("live_matching_allocation_deduplicates_without_provider_calls");

  phase = "outfit_execution_requires_current_matches_before_provider";
  const optionsWithoutMatches = await request(matchingRoute, "POST", {
    kind: "outfit_options",
    inventoryMode: "live",
    execute: false,
  });
  created.operations.push(optionsWithoutMatches.id);
  const rejectedOptions = await request(
    `/api/workflow-operations/${optionsWithoutMatches.id}/execute`,
    "POST",
  );
  assert.equal(
    rejectedOptions.status,
    "failed",
    "outfit execution without matches fails safely",
  );
  assert.equal(
    rejectedOptions.errorCode,
    "matches_not_ready",
    "outfit execution reports missing current matches",
  );
  const rejectedOperation = await client
    .from("workflow_operations")
    .select("status,safe_error_code,provider_call_count")
    .eq("workspace_id", workspaceId)
    .eq("id", optionsWithoutMatches.id)
    .single();
  assert.ifError(rejectedOperation.error);
  assert.equal(
    rejectedOperation.data.status,
    "failed",
    "missing-match rejection persisted",
  );
  assert.equal(
    rejectedOperation.data.safe_error_code,
    "matches_not_ready",
    "missing-match error persisted",
  );
  assert.equal(
    rejectedOperation.data.provider_call_count,
    0,
    "missing matches are rejected before any provider call",
  );
  passed("outfit_execution_rejects_missing_matches_before_provider");

  phase = "regeneration_intent_allocation_without_provider";
  let previous;
  try {
    previous = JSON.parse(
      readFileSync(
        new URL("../.next/owner2-e2e.json", import.meta.url),
        "utf8",
      ),
    );
  } catch {
    /* Existing inference evidence is optional. */
  }
  if (previous?.lookId) {
    const look = await client
      .from("looks")
      .select("id,revision,source_type")
      .eq("workspace_id", workspaceId)
      .eq("id", previous.lookId)
      .maybeSingle();
    assert.ifError(look.error);
    const options =
      look.data &&
      (await client
        .from("outfit_options")
        .select("id,option_type,status")
        .eq("workspace_id", workspaceId)
        .eq("look_id", look.data.id)
        .eq("source_revision", look.data.revision)
        .eq("is_current", true));
    if (options) assert.ifError(options.error);
    if (look.data?.source_type === "live" && options?.data?.length === 3) {
      const option = options.data.find(
        (entry) => entry.option_type === "closest" && entry.status === "ready",
      );
      if (option) {
        const route = `/api/looks/${look.data.id}/outfit-options/closest/regenerate`;
        const input = {
          expectedRevision: look.data.revision,
          expectedOptionId: option.id,
          inventoryMode: "sample",
          execute: false,
          intentId: randomUUID(),
        };
        const first = await request(route, "POST", input);
        created.operations.push(first.id);
        const repeated = await request(route, "POST", input);
        assert.equal(
          first.id,
          repeated.id,
          "same intent deduplicates operation allocation",
        );
        await request(`/api/workflow-operations/${first.id}/cancel`, "POST");
        const next = await request(route, "POST", {
          ...input,
          intentId: randomUUID(),
        });
        created.operations.push(next.id);
        assert.notEqual(
          next.id,
          first.id,
          "new intent after cancellation allocates new operation",
        );
        assert.equal(next.status, "queued", "regeneration remains unexecuted");
        passed(
          "regeneration_same_intent_deduplication_and_new_intent_after_cancel",
        );
      } else
        evidence.skipped.push({
          test: "regeneration_intent",
          reason: "Existing real look has no ready closest option.",
        });
    } else
      evidence.skipped.push({
        test: "regeneration_intent",
        reason:
          "Existing real look does not have three current options; no inference was started.",
      });
  } else
    evidence.skipped.push({
      test: "regeneration_intent",
      reason:
        "Existing real E2E evidence unavailable; no invented options were created.",
    });
  evidence.completed = true;
} catch (error) {
  failed = true;
  evidence.failure = {
    phase,
    code: typeof error?.code === "string" ? error.code : "smoke_failed",
  };
} finally {
  const cleanup = async (label, action) => {
    try {
      await action();
      evidence.cleanup.push({ task: label, status: "complete" });
    } catch {
      failed = true;
      evidence.cleanup.push({ task: label, status: "failed" });
    }
  };
  if (server && originalPreferences && originalProfile)
    await cleanup("restore_original_profile_and_preferences", async () => {
      const current = await request("/api/preferences");
      const restored = await request("/api/preferences", "PATCH", {
        expectedRevision: current.revision,
        preferences: originalPreferences.preferences,
      });
      assert.equal(
        restored.fingerprint,
        originalPreferences.fingerprint,
        "original personalization fingerprint restored",
      );
      assert.deepEqual(
        restored.preferences,
        originalPreferences.preferences,
        "original preference values restored",
      );
      const restoredProfile = await request("/api/profile", "PATCH", {
        expectedRevision: restored.revision,
        displayName: originalProfile.displayName,
      });
      assert.equal(
        restoredProfile.displayName,
        originalProfile.displayName,
        "original profile name restored",
      );
      evidence.personalizationFingerprintRestored = true;
    });
  await cleanup("remove_smoke_operations_and_events", async () => {
    await removeRows(
      "workflow_operation_events",
      "operation_id",
      created.operations,
    );
    await removeRows("workflow_operations", "id", created.operations);
  });
  await cleanup(
    "remove_new_fixture_rows_and_private_storage_object",
    async () => {
      if (created.look)
        await removeRows("inspiration_pieces", "look_id", [created.look]);
      await removeRows("wardrobe_items", "id", created.wardrobe);
      await removeRows("workflow_drafts", "id", created.drafts);
      if (created.look) await removeRows("looks", "id", [created.look]);
      if (created.asset) {
        const asset = await client
          .from("assets")
          .select("bucket,storage_path")
          .eq("workspace_id", workspaceId)
          .eq("id", created.asset)
          .single();
        assert.ifError(asset.error);
        const removed = await client.storage
          .from(asset.data.bucket)
          .remove([asset.data.storage_path]);
        assert.ifError(removed.error);
        await removeRows("assets", "id", [created.asset]);
      }
    },
  );
  server?.stop();
  if (failed) evidence.completed = false;
  saveEvidence();
  console.log(
    JSON.stringify({
      suite: evidence.suite,
      completed: evidence.completed,
      passed: evidence.passed,
      skipped: evidence.skipped,
      httpRequests: evidence.httpRequests,
      cleanup: evidence.cleanup,
      ...(evidence.failure ? { failure: evidence.failure } : {}),
    }),
  );
  if (failed) process.exitCode = 1;
}
