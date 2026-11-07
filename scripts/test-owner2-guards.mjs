import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import {
  api,
  client,
  owner2Workspace,
  startTestServer,
} from "./owner2-test-utils.mjs";

const workspaceId = await owner2Workspace();
const cases = [];
let server;
let originalProfile;
let restoreNeeded = false;
const fixtureNames = [
  `Guard fixture ${randomUUID()}`,
  `Guard fixture ${randomUUID()}`,
];

function expectStatus(response, status, label) {
  assert.equal(response.status, status, `${label}: unexpected HTTP status`);
}

function data(response, label) {
  expectStatus(response, 200, label);
  assert.ok(response.data, `${label}: missing data envelope`);
  return response.data;
}

async function assetCount() {
  const { count, error } = await client
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  if (error) throw new Error("asset_count_read_failed");
  return count;
}

async function stopServer() {
  if (!server) return;
  const current = server;
  server = undefined;
  current.stop();
  for (let attempt = 0; attempt < 100; attempt++) {
    let reachable = false;
    try {
      reachable = (
        await fetch(`${current.base}/api/health`, {
          signal: AbortSignal.timeout(500),
        })
      ).ok;
    } catch {}
    if (
      !reachable &&
      !existsSync(new URL("../.next/dev/lock", import.meta.url))
    )
      return;
    await delay(100);
  }
  throw new Error("test_server_shutdown_timeout");
}

async function restoreProfile() {
  if (!restoreNeeded || !server || !originalProfile) return;
  const current = data(
    await api(server.base, "/api/profile"),
    "cleanup_read_profile",
  );
  if (current.displayName === originalProfile.displayName) {
    restoreNeeded = false;
    return;
  }
  if (!fixtureNames.includes(current.displayName))
    throw new Error("cleanup_profile_changed_externally");
  expectStatus(
    await api(server.base, "/api/profile", "PATCH", {
      expectedRevision: current.revision,
      displayName: originalProfile.displayName,
    }),
    200,
    "cleanup_restore_profile",
  );
  restoreNeeded = false;
}

try {
  const beforeAssets = await assetCount();
  server = await startTestServer(workspaceId, false, 3104);
  const preferences = data(
    await api(server.base, "/api/preferences"),
    "read_only_preferences",
  );
  cases.push("read_only_preferences_available");
  expectStatus(
    await api(server.base, "/api/workflow-drafts", "POST", {
      featureKind: "preferences",
      payload: {},
    }),
    403,
    "read_only_draft",
  );
  cases.push("disabled_writes_reject_draft");
  expectStatus(
    await api(server.base, "/api/profile", "PATCH", {
      expectedRevision: preferences.revision,
      displayName: fixtureNames[0],
    }),
    403,
    "read_only_profile",
  );
  cases.push("disabled_writes_reject_profile");
  for (const [label, input] of [
    [
      "mime",
      { fileName: "invalid.svg", mimeType: "image/svg+xml", byteSize: 1024 },
    ],
    [
      "size",
      {
        fileName: "oversized.jpg",
        mimeType: "image/jpeg",
        byteSize: 10 * 1024 * 1024 + 1,
      },
    ],
  ]) {
    expectStatus(
      await api(server.base, "/api/inspiration/uploads", "POST", input),
      400,
      `invalid_upload_${label}`,
    );
    cases.push(`invalid_upload_${label}_rejected`);
  }
  assert.equal(
    await assetCount(),
    beforeAssets,
    "invalid uploads allocated storage assets",
  );
  cases.push("invalid_uploads_allocate_no_assets");
  expectStatus(
    await api(server.base, `/api/looks/${randomUUID()}`),
    404,
    "unknown_look",
  );
  cases.push("unknown_look_unavailable");
  await stopServer();

  server = await startTestServer(workspaceId, true, 3104);
  originalProfile = data(
    await api(server.base, "/api/profile"),
    "original_profile",
  );
  const originalPreferences = data(
    await api(server.base, "/api/preferences"),
    "original_preferences",
  );
  restoreNeeded = true;
  const responses = await Promise.all(
    fixtureNames.map((displayName) =>
      api(server.base, "/api/profile", "PATCH", {
        expectedRevision: originalProfile.revision,
        displayName,
      }),
    ),
  );
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
    "concurrent profile writes did not enforce one winner",
  );
  const winner = data(
    responses.find((response) => response.status === 200),
    "winning_profile_write",
  );
  const currentProfile = data(
    await api(server.base, "/api/profile"),
    "read_concurrent_profile",
  );
  assert.equal(
    currentProfile.revision,
    originalProfile.revision + 1,
    "profile revision increment mismatch",
  );
  assert.equal(
    currentProfile.displayName,
    winner.displayName,
    "conflicting profile write overwrote the winner",
  );
  assert.equal(
    data(
      await api(server.base, "/api/preferences"),
      "preferences_after_name_change",
    ).fingerprint,
    originalPreferences.fingerprint,
    "name edit changed personalization fingerprint",
  );
  cases.push("concurrent_profile_cas_one_winner");
  cases.push("profile_edit_preserves_personalization");
  await restoreProfile();
  assert.equal(
    data(await api(server.base, "/api/profile"), "restored_profile")
      .displayName,
    originalProfile.displayName,
    "profile cleanup mismatch",
  );
  console.log(
    JSON.stringify({
      suite: "owner2_http_guards",
      status: "passed",
      workspace: "dev-owner-2",
      cases,
      providerCalls: 0,
      cleanup: "original_profile_restored",
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      suite: "owner2_http_guards",
      status: "failed",
      code:
        error instanceof assert.AssertionError
          ? "assertion_failed"
          : error instanceof Error && /^[a-z_]+$/.test(error.message)
            ? error.message
            : "guard_test_failed",
      completedCases: cases,
      providerCalls: 0,
    }),
  );
  process.exitCode = 1;
} finally {
  try {
    await restoreProfile();
  } catch {
    console.error(
      JSON.stringify({
        suite: "owner2_http_guards",
        cleanup: "profile_restore_failed",
      }),
    );
    process.exitCode = 1;
  }
  try {
    await stopServer();
  } catch {
    console.error(
      JSON.stringify({
        suite: "owner2_http_guards",
        cleanup: "server_shutdown_failed",
      }),
    );
    process.exitCode = 1;
  }
}
