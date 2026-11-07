import assert from "node:assert/strict";
import {
  api,
  client,
  owner2Workspace,
  startTestServer,
} from "./owner2-test-utils.mjs";

const workspaceId = await owner2Workspace();
const server = await startTestServer(workspaceId);
const draftIds = [];
const original = await api(server.base, "/api/preferences");
const originalProfile = await api(server.base, "/api/profile");
assert.equal(original.status, 200);
assert.equal(originalProfile.status, 200);
let completed = false;
try {
  const preferences = {
    skinSwatchId: "depth_04",
    skinSwatchHex: "#B9805D",
    undertone: "warm",
    contrast: "medium",
    fit: "relaxed",
    bodyIllustrationGroup: "men",
    bodyIllustrationId: "rectangle",
    proportions: ["long torso"],
    styles: ["relaxed_minimal"],
    colorFamilies: ["neutrals"],
    occasions: ["casual dinner"],
    climate: ["warm"],
    coverage: ["covered shoulders"],
    lengths: ["full length"],
    layering: ["light layers"],
    fabricDislikes: ["itchy wool"],
    footwearComfort: ["flat shoes"],
    careTolerance: ["machine washable"],
  };
  let saved = await api(server.base, "/api/preferences", "PATCH", {
    expectedRevision: original.data.revision,
    preferences,
  });
  assert.equal(saved.status, 200, "preferences save");
  assert.deepEqual(saved.data.preferences, preferences);
  const reloaded = await api(server.base, "/api/preferences");
  assert.deepEqual(reloaded.data, saved.data);
  const stale = await api(server.base, "/api/preferences", "PATCH", {
    expectedRevision: original.data.revision,
    preferences: {},
  });
  assert.equal(stale.status, 409);
  const named = await api(server.base, "/api/profile", "PATCH", {
    expectedRevision: saved.data.revision,
    displayName: "Owner 2 test",
  });
  assert.equal(named.status, 200);
  const afterName = await api(server.base, "/api/preferences");
  assert.equal(afterName.data.fingerprint, saved.data.fingerprint);
  assert.deepEqual(afterName.data.preferences, preferences);
  const invalid = await api(server.base, "/api/preferences", "PATCH", {
    expectedRevision: named.data.revision,
    preferences: { skinSwatchId: "depth_04", skinSwatchHex: "#FFFFFF" },
  });
  assert.equal(invalid.status, 400);
  const forbiddenField = await api(server.base, "/api/profile", "PATCH", {
    expectedRevision: named.data.revision,
    displayName: "Test",
    workspaceId,
  });
  assert.equal(forbiddenField.status, 400);
  const draft = await api(server.base, "/api/workflow-drafts", "POST", {
    featureKind: "preferences",
    payload: { undertone: "unsure", skinSwatchId: "depth_01" },
  });
  assert.equal(draft.status, 200, "draft create");
  draftIds.push(draft.data.id);
  const readDraft = await api(
    server.base,
    `/api/workflow-drafts/${draft.data.id}`,
  );
  assert.equal(readDraft.status, 200);
  assert.equal(readDraft.data.payload.undertone, "unsure");
  const patched = await api(
    server.base,
    `/api/workflow-drafts/${draft.data.id}`,
    "PATCH",
    {
      expectedRevision: readDraft.data.revision,
      payload: { fit: "oversized" },
    },
  );
  assert.equal(patched.status, 200);
  const draftConflict = await api(
    server.base,
    `/api/workflow-drafts/${draft.data.id}`,
    "PATCH",
    { expectedRevision: readDraft.data.revision, payload: {} },
  );
  assert.equal(draftConflict.status, 409);
  const discarded = await api(
    server.base,
    `/api/workflow-drafts/${draft.data.id}`,
    "PATCH",
    { expectedRevision: patched.data.revision, status: "discarded" },
  );
  assert.equal(discarded.status, 200);
  completed = true;
  console.log(
    JSON.stringify({
      suite: "owner2_profile_preferences",
      passed: [
        "hosted_save_reload",
        "all_preference_groups",
        "revision_conflict",
        "name_preserves_personalization",
        "swatch_validation",
        "workspace_input_rejection",
        "draft_restore_patch_discard",
      ],
    }),
  );
} finally {
  const current = await api(server.base, "/api/preferences");
  const restored = await api(server.base, "/api/preferences", "PATCH", {
    expectedRevision: current.data.revision,
    preferences: original.data.preferences,
  });
  assert.equal(restored.status, 200, "restore original preferences");
  const restoredProfile = await api(server.base, "/api/profile", "PATCH", {
    expectedRevision: restored.data.revision,
    displayName: originalProfile.data.displayName,
  });
  assert.equal(restoredProfile.status, 200, "restore original profile");
  if (draftIds.length) {
    const { error } = await client
      .from("workflow_drafts")
      .delete()
      .eq("workspace_id", workspaceId)
      .in("id", draftIds);
    assert.ifError(error);
  }
  server.stop();
  console.log(
    JSON.stringify({
      cleanup: "restored_profile_preferences_removed_test_drafts",
      completed,
    }),
  );
}
