import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { parseArgs, promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseDatabaseConfig } from "../src/lib/config/runtime-schema.ts";
import { seedIdentity, validateManifest } from "./seed-wardrobe.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const uuid = z.uuid();
const terminal = new Set(["succeeded", "failed", "cancelled", "superseded"]);
class SmokeFailure extends Error {}
const check = (condition, code) => {
  if (!condition) throw new SmokeFailure(code);
};
const log = (event, details = {}) =>
  console.log(JSON.stringify({ event, ...details }));
let state, statePath, client, config, origin;
const scoped = (table, fields = "*") =>
  client.from(table).select(fields).eq("workspace_id", config.workspaceId);
async function data(query, code) {
  const result = await query;
  check(!result.error, code);
  return result.data;
}
async function checkpoint() {
  const temporary = statePath + "." + randomUUID() + ".tmp";
  await writeFile(temporary, JSON.stringify(state, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  await rename(temporary, statePath);
}
async function rpc(name, input) {
  return data(
    client.rpc(name, { ...input, p_workspace_id: config.workspaceId }),
    "RPC_" + name.toUpperCase(),
  );
}
async function app(path, method = "GET", body) {
  const response = await fetch(new URL(path, origin), {
    method,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(315_000),
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const payload = await response.json();
  const code = payload?.error?.code ?? payload?.code;
  check(
    response.ok,
    typeof code === "string" && /^[a-zA-Z0-9_]{1,120}$/.test(code)
      ? code.toUpperCase()
      : "HTTP_" + response.status,
  );
  check(
    response.headers.get("cache-control")?.includes("no-store"),
    "HTTP_CACHE_GUARD_MISSING",
  );
  return payload.data ?? payload;
}
async function assertApp() {
  const health = await app("/api/health");
  check(
    health.databaseConfigured && health.writesEnabled,
    "APP_WRITES_MUST_BE_ENABLED",
  );
  if (state?.prepared) {
    const preview = await app("/api/previews?draftId=" + state.previewDraftId);
    check(preview.draftId === state.previewDraftId, "APP_WORKSPACE_MISMATCH");
  }
}
function saveKey(kind) {
  return "owner4-smoke:" + state.runId + ":" + kind;
}
async function savedRows() {
  return data(
    scoped("saved_look_snapshots", "id,idempotency_key").in("idempotency_key", [
      saveKey("preview"),
      saveKey("capsule"),
    ]),
    "SAVED_LOOK_READ_FAILED",
  );
}
async function operations() {
  const saves = await savedRows();
  const groups = [
    ["draft", [state.previewDraftId]],
    ["capsule", [state.capsuleId]],
    ["saved_look", saves.map((row) => row.id)],
  ];
  const rows = [];
  for (const [subject, ids] of groups) {
    if (ids.length)
      rows.push(
        ...(await data(
          scoped("workflow_operations")
            .eq("subject_type", subject)
            .in("subject_id", ids),
          "OPERATION_READ_FAILED",
        )),
      );
  }
  state.operationIds = [...new Set(rows.map((row) => row.id))];
  state.savedIds = saves.map((row) => row.id);
  for (const row of rows) {
    if (
      uuid.safeParse(row.result_ref?.assetId).success &&
      !state.initialAssets.includes(row.result_ref.assetId)
    ) {
      state.assetIds = [
        ...new Set([...state.assetIds, row.result_ref.assetId]),
      ];
    }
  }
  await checkpoint();
  return rows;
}
async function seedFixtures() {
  const count = await data(
    scoped("wardrobe_items", "id").limit(1),
    "WARDROBE_READ_FAILED",
  );
  if (count.length) return;
  const dataset = validateManifest(
    JSON.parse(
      await readFile(join(root, "data/wardrobe/wardrobe.json"), "utf8"),
    ),
  );
  const pieces = [
    ["top", 3],
    ["bottom", 2],
    ["shoes", 1],
    ["accessory", 1],
  ]
    .flatMap(([category, amount]) => {
      const found = dataset.items
        .filter(
          (item) =>
            item.category === category &&
            item.attributes.functionalFamily === "everyday",
        )
        .slice(0, amount);
      check(found.length === amount, "DATASET_FIXTURES_INSUFFICIENT");
      return found;
    })
    .map((item, index) => ({
      ...item,
      id: "owner4-" + state.runId + "-" + index,
      name: "Smoke sample " + item.name.slice(0, 147),
    }));
  state.seedKeys = pieces.map((item) => item.id);
  state.wardrobeIds = pieces.map(
    (item) => seedIdentity(config.workspaceId, item.id).itemId,
  );
  state.assetIds = pieces.map(
    (item) => seedIdentity(config.workspaceId, item.id).assetId,
  );
  await checkpoint();
  const directory = await mkdtemp(join(tmpdir(), "stylora-owner4-fixtures-"));
  try {
    await mkdir(join(directory, "images"));
    for (const item of pieces)
      await copyFile(
        join(root, "data/wardrobe/images", item.imageName),
        join(directory, "images", item.imageName),
      );
    await writeFile(
      join(directory, "wardrobe.json"),
      JSON.stringify({
        ...dataset,
        itemCount: pieces.length,
        imageBase: "images",
        items: pieces,
      }),
    );
    await promisify(execFile)(
      process.execPath,
      [
        "--experimental-strip-types",
        join(root, "scripts/seed-wardrobe.mjs"),
        "--apply",
        "--expected-workspace",
        "dev-owner-4",
        "--manifest",
        join(directory, "wardrobe.json"),
      ],
      {
        env: process.env,
        windowsHide: true,
        timeout: 180_000,
        maxBuffer: 1024 * 1024,
      },
    );
  } finally {
    const target = await realpath(directory);
    check(
      dirname(target) === (await realpath(tmpdir())) &&
        target.split(/[\\/]/).at(-1).startsWith("stylora-owner4-fixtures-"),
      "TEMP_DIRECTORY_GUARD",
    );
    await rm(target, { recursive: true, force: true });
  }
}
async function prepare() {
  await seedFixtures();
  const inventory = await data(
    scoped("wardrobe_items", "id,category,subcategory,asset_id")
      .eq("inventory_status", "owned")
      .is("archived_at", null)
      .not("asset_id", "is", null)
      .order("id")
      .limit(100),
    "OWNED_ITEMS_READ_FAILED",
  );
  const pick = (category, amount) =>
    inventory.filter((item) => item.category === category).slice(0, amount);
  const tops = pick("top", 3),
    bottoms = pick("bottom", 2),
    shoes = pick("shoes", 1);
  const bags = inventory
    .filter(
      (item) =>
        item.category === "accessory" &&
        /bag|tote|clutch|backpack|handbag/i.test(item.subcategory ?? ""),
    )
    .slice(0, 1);
  check(
    tops.length * bottoms.length >= 3 && shoes.length,
    "EXISTING_WARDROBE_INSUFFICIENT",
  );
  state.includedIds = [...tops, ...bottoms, ...shoes].map((item) => item.id);
  const selection = {
    top: tops[0].id,
    bottom: bottoms[0].id,
    shoes: shoes[0].id,
    ...(bags[0] ? { bags: bags[0].id } : {}),
  };
  await data(
    client
      .from("workflow_drafts")
      .insert({
        id: state.previewDraftId,
        workspace_id: config.workspaceId,
        feature_kind: "preview",
        payload: { selection },
        current_step: "selection",
      }),
    "PREVIEW_FIXTURE_FAILED",
  );
  const preview = await app("/api/previews?draftId=" + state.previewDraftId);
  check(preview.draftId === state.previewDraftId, "APP_WORKSPACE_MISMATCH");
  const brief = {
    templateId: "everyday-ease",
    days: 3,
    targetOutfits: 3,
    activities: ["City walks"],
    weather: "Mild",
    laundry: null,
    notes:
      "Owner 4 smoke sample. Prefer complete owned-only outfits using these labeled fixtures.",
    palette: "Mixed casual colors",
    dressCode: "Casual",
    luggage: null,
    footwear: "Walkable flats",
    coverage: null,
    care: null,
    includedItemIds: state.includedIds,
    requiredItemIds: [shoes[0].id],
    excludedItemIds: bags.map((item) => item.id),
  };
  const draft = await app(
    "/api/capsules/drafts/" + state.capsuleDraftId,
    "PUT",
    { expectedRevision: 0, brief, step: 3, visited: 3 },
  );
  check(draft.ok && draft.id === state.capsuleDraftId, "CAPSULE_DRAFT_FAILED");
  state.capsuleDraftRevision = draft.revision;
  state.previewRevision = preview.revision;
  state.prepared = true;
  await checkpoint();
  log("prepared", {
    manifest: statePath,
    previewDraftId: state.previewDraftId,
    capsuleDraftId: state.capsuleDraftId,
    fixtureCount: state.wardrobeIds.length,
  });
}
async function reserve(kind, stage) {
  if (state.reserved[stage]) return;
  check(state.budget[kind] < 2, "MODEL_BUDGET_EXHAUSTED");
  state.budget[kind]++;
  state.reserved[stage] = true;
  await checkpoint();
}
async function execute(kind, stage, path, body, subjectId) {
  let current = (await operations())
    .filter((row) => row.subject_id === subjectId && row.kind === stage)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
  if (current?.status !== "succeeded") {
    await reserve(kind, stage + ":" + subjectId);
    await app(path, "POST", body);
  } else if (stage === "saved_avatar") {
    await app(path, "POST", body);
  }
  const deadline = Date.now() + 300_000;
  do {
    current = (await operations())
      .filter((row) => row.subject_id === subjectId && row.kind === stage)
      .sort((left, right) =>
        right.created_at.localeCompare(left.created_at),
      )[0];
    check(
      current && current.attempt_count <= 1,
      "UNEXPECTED_OPERATION_ATTEMPT",
    );
    if (terminal.has(current.status)) break;
    check(
      !current.lease_until || Date.parse(current.lease_until) > Date.now(),
      "EXPIRED_LEASE_REQUIRES_REVIEW",
    );
    if (current.status === "queued") await app(path, "POST", body);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 3000));
  } while (Date.now() < deadline);
  check(
    current?.status === "succeeded",
    "OPERATION_" +
      (current?.safe_error_code ?? current?.status ?? "MISSING").toUpperCase(),
  );
  log("operation", {
    id: current.id,
    kind: current.kind,
    status: current.status,
    attempt: current.attempt_count,
  });
  return current;
}
async function save(kind, sourceId, parentId, revision) {
  const input = {
    p_source_kind: kind,
    p_source_id: sourceId,
    p_parent_id: parentId,
    p_expected_revision: revision,
    p_idempotency_key: saveKey(kind),
    p_title: "Owner 4 smoke sample " + kind,
  };
  const first = await rpc("save_studio_look", input);
  await operations();
  const repeated = await rpc("save_studio_look", input);
  check(
    first.savedLookId === repeated.savedLookId &&
      first.operationId === repeated.operationId,
    "DUPLICATE_SAVE_CREATED_ROWS",
  );
  log("save", {
    kind,
    id: first.savedLookId,
    operationId: first.operationId,
    duplicateReused: true,
  });
  return first;
}
async function exercise() {
  check(state.prepared && !state.cleaned, "PREPARE_REQUIRED");
  if (state.exercised) {
    log("exercise_already_complete", { runId: state.runId });
    return;
  }
  await assertApp();
  const preferences = await data(
    scoped("user_preferences", "revision").maybeSingle(),
    "PREFERENCES_READ_FAILED",
  );
  check(preferences, "PREVIEW_REQUIRES_PREFERENCE_ROW");
  if (!state.capsulePrepared) {
    const prepared = await app("/api/capsules", "POST", {
      draftId: state.capsuleDraftId,
      expectedRevision: state.capsuleDraftRevision,
    });
    check(prepared.capsuleId === state.capsuleId, "CAPSULE_ID_MISMATCH");
    state.capsulePrepared = true;
    await checkpoint();
  }
  await execute(
    "text",
    "capsule_generation",
    "/api/capsules/" + state.capsuleId + "/generate",
    {},
    state.capsuleId,
  );
  const result = await app("/api/capsules/" + state.capsuleId);
  check(
    result.result.outfits.length === 3 && !result.generationNeeded,
    "CAPSULE_RESULTS_INVALID",
  );
  const outfit = result.result.outfits.find((entry) => !entry.requiresAddition);
  check(outfit && outfit.items.length >= 2, "OWNED_OUTFIT_MISSING");
  check(
    outfit.items.every((item) => state.includedIds.includes(item.id)),
    "OWNED_ITEM_REFERENCE_INVALID",
  );
  const preview = await execute(
    "image",
    "preview_image",
    "/api/previews",
    {
      draftId: state.previewDraftId,
      expectedRevision: state.previewRevision,
      renderRequestId: state.runId,
    },
    state.previewDraftId,
  );
  const previewRead = await app(
    "/api/previews?draftId=" + state.previewDraftId,
  );
  check(previewRead.job.status === "succeeded", "PREVIEW_RELOAD_FAILED");
  const asset = await data(
    scoped("assets", "id,bucket,storage_path,mime_type,byte_size,status")
      .eq("id", preview.result_ref.assetId)
      .single(),
    "OUTPUT_ASSET_MISSING",
  );
  check(
    asset.status === "ready" &&
      asset.bucket === "previews" &&
      asset.mime_type === "image/png",
    "OUTPUT_ASSET_INVALID",
  );
  const download = await client.storage
    .from(asset.bucket)
    .download(asset.storage_path);
  check(
    !download.error && download.data?.size === asset.byte_size,
    "OUTPUT_BYTES_UNAVAILABLE",
  );
  const savedPreview = await save(
    "preview",
    state.previewDraftId,
    null,
    previewRead.revision,
  );
  const reused = await execute(
    "image",
    "saved_avatar",
    "/api/avatars/" + savedPreview.operationId,
    undefined,
    savedPreview.savedLookId,
  );
  check(reused.result_ref.assetId === asset.id, "PREVIEW_REUSE_FAILED");
  const reuseReservation = "saved_avatar:" + savedPreview.savedLookId;
  if (state.reserved[reuseReservation]) {
    delete state.reserved[reuseReservation];
    state.budget.image--;
    await checkpoint();
  }
  const savedCapsule = await save(
    "capsule",
    outfit.id,
    state.capsuleId,
    result.revision,
  );
  await execute(
    "image",
    "saved_avatar",
    "/api/avatars/" + savedCapsule.operationId,
    undefined,
    savedCapsule.savedLookId,
  );
  state.exercised = true;
  await checkpoint();
  log("exercise_complete", {
    capsuleId: state.capsuleId,
    savedIds: state.savedIds,
    reserved: state.budget,
  });
}
async function cleanup() {
  const rows = await operations();
  const active = rows.filter(
    (row) =>
      ["running", "partial", "cancelled"].includes(row.status) &&
      Date.parse(row.lease_until) > Date.now(),
  );
  const provenAssets = new Set([
    ...state.seedKeys.map(
      (key) => seedIdentity(config.workspaceId, key).assetId,
    ),
    ...rows.map((row) => row.result_ref?.assetId),
    ...state.removals.map((row) => row.id),
  ]);
  check(
    state.assetIds.every(
      (id) => provenAssets.has(id) && !state.initialAssets.includes(id),
    ),
    "ASSET_OWNERSHIP_MISMATCH",
  );
  for (const row of rows.filter((entry) =>
    ["queued", "running", "partial"].includes(entry.status),
  ))
    await rpc("cancel_workflow_operation", { p_operation_id: row.id });
  check(!active.length, "CLEANUP_WAIT_FOR_ACTIVE_LEASE");
  for (const saved of await savedRows())
    await rpc("delete_saved_look", { p_saved_look_id: saved.id });
  const capsule = await data(
    scoped("capsules", "id,revision").eq("id", state.capsuleId).maybeSingle(),
    "CAPSULE_CLEANUP_READ_FAILED",
  );
  if (capsule)
    await rpc("delete_capsule", {
      p_capsule_id: capsule.id,
      p_expected_revision: capsule.revision,
    });
  if (state.operationIds.length)
    await data(
      client
        .from("workflow_operations")
        .delete()
        .eq("workspace_id", config.workspaceId)
        .in("id", state.operationIds),
      "OPERATIONS_CLEANUP_FAILED",
    );
  await data(
    client
      .from("workflow_drafts")
      .delete()
      .eq("workspace_id", config.workspaceId)
      .in("id", [state.previewDraftId, state.capsuleDraftId]),
    "DRAFT_CLEANUP_FAILED",
  );
  if (state.wardrobeIds.length) {
    const fixtures = await data(
      scoped("wardrobe_items", "id,source_type,import_idempotency_key").in(
        "id",
        state.wardrobeIds,
      ),
      "FIXTURE_CLEANUP_READ_FAILED",
    );
    check(
      fixtures.every(
        (row) =>
          row.source_type === "sample" &&
          row.import_idempotency_key.startsWith(
            "wardrobe-starter.v1:owner4-" + state.runId + "-",
          ),
      ),
      "FIXTURE_OWNERSHIP_MISMATCH",
    );
    await data(
      client
        .from("wardrobe_items")
        .delete()
        .eq("workspace_id", config.workspaceId)
        .in("id", state.wardrobeIds),
      "WARDROBE_CLEANUP_FAILED",
    );
  }
  for (const id of state.assetIds) {
    const otherOps = await data(
      scoped("workflow_operations", "id")
        .contains("result_ref", { assetId: id })
        .limit(1),
      "ASSET_REFERENCE_CHECK_FAILED",
    );
    const snakeRefs = await data(
      scoped("saved_look_snapshots", "id")
        .contains("items", [{ asset_id: id }])
        .limit(1),
      "ASSET_REFERENCE_CHECK_FAILED",
    );
    const camelRefs = await data(
      scoped("saved_look_snapshots", "id")
        .contains("items", [{ assetId: id }])
        .limit(1),
      "ASSET_REFERENCE_CHECK_FAILED",
    );
    check(
      !otherOps.length && !snakeRefs.length && !camelRefs.length,
      "ASSET_STILL_REFERENCED",
    );
    let removal = state.removals.find((entry) => entry.id === id);
    const row = await data(
      scoped("assets", "id,bucket,storage_path").eq("id", id).maybeSingle(),
      "ASSET_CLEANUP_READ_FAILED",
    );
    if (row) {
      removal = { id, bucket: row.bucket, path: row.storage_path };
      check(
        removal.path.startsWith(config.workspaceId + "/" + id + "/"),
        "ASSET_PATH_MISMATCH",
      );
      state.removals = [
        ...state.removals.filter((entry) => entry.id !== id),
        removal,
      ];
      await checkpoint();
      await data(
        client
          .from("assets")
          .delete()
          .eq("workspace_id", config.workspaceId)
          .eq("id", id),
        "ASSET_METADATA_STILL_REFERENCED",
      );
    }
    if (removal) {
      check(
        ["wardrobe", "previews"].includes(removal.bucket) &&
          removal.path.startsWith(config.workspaceId + "/" + id + "/"),
        "STORAGE_PATH_SCOPE_MISMATCH",
      );
      const removed = await client.storage
        .from(removal.bucket)
        .remove([removal.path]);
      check(!removed.error, "STORAGE_CLEANUP_FAILED");
    }
  }
  state.cleaned = true;
  await checkpoint();
  log("cleanup_complete", {
    runId: state.runId,
    saved: state.savedIds.length,
    operations: state.operationIds.length,
    wardrobe: state.wardrobeIds.length,
    assets: state.assetIds.length,
  });
}
async function main() {
  const { values } = parseArgs({
    options: {
      run: { type: "boolean" },
      prepare: { type: "boolean" },
      exercise: { type: "boolean" },
      cleanup: { type: "boolean" },
      manifest: { type: "string" },
      base: { type: "string", default: "http://127.0.0.1:3104" },
    },
  });
  const phase = ["prepare", "exercise", "cleanup"].filter(
    (name) => values[name],
  );
  if (!values.run) {
    log("dry_run", {
      usage:
        "--run --prepare|--exercise|--cleanup --manifest <absolute path outside repository>",
      base: values.base,
    });
    return;
  }
  check(phase.length === 1 && values.manifest, "CHOOSE_ONE_PHASE_AND_MANIFEST");
  statePath = resolve(values.manifest);
  const within = relative(root, statePath);
  check(
    within === ".." || within.startsWith(".." + sep) || isAbsolute(within),
    "MANIFEST_MUST_BE_OUTSIDE_REPOSITORY",
  );
  const lock = await open(statePath + ".lock", "wx", 0o600);
  try {
    config = parseDatabaseConfig(process.env);
    check(config?.writesEnabled, "DEV_WORKSPACE_WRITE_CONFIGURATION_REQUIRED");
    client = createClient(config.url, config.secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const workspace = await data(
      client
        .from("workspaces")
        .select("id,name")
        .eq("id", config.workspaceId)
        .single(),
      "WORKSPACE_UNAVAILABLE",
    );
    check(workspace.name === "dev-owner-4", "DEV_OWNER_4_REQUIRED");
    origin = new URL(values.base);
    check(
      origin.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) &&
        !origin.username &&
        !origin.password &&
        origin.pathname === "/" &&
        !origin.search &&
        !origin.hash,
      "LOOPBACK_APP_ORIGIN_REQUIRED",
    );
    if (phase[0] === "prepare") {
      const runId = randomUUID();
      state = {
        version: 1,
        runId,
        workspaceId: config.workspaceId,
        base: origin.origin,
        previewDraftId: seedIdentity(
          config.workspaceId,
          "owner4-" + runId + "-preview",
        ).itemId,
        capsuleDraftId: seedIdentity(
          config.workspaceId,
          "owner4-" + runId + "-capsule",
        ).itemId,
        assetIds: [],
        wardrobeIds: [],
        savedIds: [],
        operationIds: [],
        seedKeys: [],
        removals: [],
        reserved: {},
        budget: { text: 0, image: 0 },
      };
      state.capsuleId = state.capsuleDraftId;
      state.initialAssets = (
        await data(scoped("assets", "id").limit(1000), "ASSET_BASELINE_FAILED")
      ).map((row) => row.id);
      check(state.initialAssets.length < 1000, "ASSET_BASELINE_LIMIT_EXCEEDED");
      await writeFile(statePath, JSON.stringify(state), {
        flag: "wx",
        mode: 0o600,
      });
      await assertApp();
    } else {
      state = JSON.parse(await readFile(statePath, "utf8"));
      uuid.parse(state.runId);
      check(
        state.version === 1 &&
          state.workspaceId === config.workspaceId &&
          state.base === origin.origin,
        "MANIFEST_TARGET_MISMATCH",
      );
      check(
        state.previewDraftId ===
          seedIdentity(config.workspaceId, "owner4-" + state.runId + "-preview")
            .itemId &&
          state.capsuleDraftId ===
            seedIdentity(
              config.workspaceId,
              "owner4-" + state.runId + "-capsule",
            ).itemId,
        "MANIFEST_IDS_MISMATCH",
      );
      check(
        state.capsuleId === state.capsuleDraftId &&
          state.seedKeys.every((key) =>
            key.startsWith("owner4-" + state.runId + "-"),
          ) &&
          JSON.stringify(state.wardrobeIds) ===
            JSON.stringify(
              state.seedKeys.map(
                (key) => seedIdentity(config.workspaceId, key).itemId,
              ),
            ),
        "MANIFEST_FIXTURE_IDS_MISMATCH",
      );
    }
    try {
      await { prepare, exercise, cleanup }[phase[0]]();
    } catch (error) {
      if (phase[0] !== "cleanup")
        await cleanup().catch(() =>
          log("cleanup_pending", { manifest: statePath }),
        );
      throw error;
    }
  } finally {
    await lock.close();
    await unlink(statePath + ".lock");
  }
}
try {
  await main();
} catch (error) {
  log("failed", {
    code:
      error instanceof SmokeFailure
        ? error.message
        : "SMOKE_GUARD_OR_CONNECTION_FAILED",
  });
  process.exitCode = 1;
}
