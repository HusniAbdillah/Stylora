import { randomUUID } from "node:crypto";
import { open, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { z } from "zod";
import { parseDatabaseConfig } from "../src/lib/config/runtime-schema.ts";
import { skinSwatchOptions } from "../src/features/preferences/preferences-types.ts";
import { seedIdentity } from "./seed-wardrobe.mjs";

class VerificationFailure extends Error {}
function check(condition, code) {
  if (!condition) throw new VerificationFailure(code);
}
const log = (event, details = {}) => console.log(JSON.stringify({ event, ...details }));
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const canonical = (value) => JSON.stringify(value, Object.keys(value).sort());
const preferences = z.record(z.string(), z.union([z.string(), z.array(z.string()), z.null()]));
const preferenceState = z.object({ revision: z.number().int().positive(), preferences });
const renderSettings = z.strictObject({
  version: z.literal("avatar-render.v2"), quality: z.enum(["low", "medium", "high"]),
  size: z.literal("1024x1536"), format: z.literal("png"), inputFidelity: z.literal("high"),
});
const receipt = z.object({ requestId: z.uuid(), status: z.string() }).passthrough();
const journal = z.object({
  version: z.literal(1), runId: z.uuid(), workspaceId: z.uuid(), base: z.url(),
  previewDraftId: z.uuid(), prepared: z.literal(true), cleaned: z.literal(false).optional(),
  seedKeys: z.array(z.string()).min(2), wardrobeIds: z.array(z.uuid()).min(2),
  budget: z.object({ image: z.number().int().nonnegative().max(3) }).passthrough(),
  personalization: z.object({
    original: preferenceState, lastWritten: preferenceState.nullable(),
    selection: z.object({ top: z.uuid(), bottom: z.uuid() }),
    cases: z.object({ a: receipt.optional(), b: receipt.optional(), quality: receipt.optional() }),
    restored: z.boolean().optional(), restoreRevision: z.number().int().positive().optional(),
  }).optional(),
}).passthrough();
let state, statePath, client, config, base;
const scoped = (table, fields = "*") => client.from(table).select(fields).eq("workspace_id", config.workspaceId);
async function data(query, code) {
  const result = await query;
  check(!result.error, code);
  return result.data;
}
async function checkpoint() {
  const temporary = statePath + "." + randomUUID() + ".tmp";
  await writeFile(temporary, JSON.stringify(state, null, 2), { flag: "wx", mode: 0o600 });
  await rename(temporary, statePath);
}
async function external(path) {
  check(isAbsolute(path), "ABSOLUTE_EXTERNAL_PATH_REQUIRED");
  const actual = await realpath(path);
  const directory = (await stat(actual)).isDirectory() ? actual : dirname(actual);
  for (let parent = directory; parent !== dirname(parent); parent = dirname(parent)) {
    const git = await stat(join(parent, ".git")).catch((error) => {
      if (error.code !== "ENOENT") throw error;
      return null;
    });
    check(!git, "PATH_MUST_BE_OUTSIDE_GIT_CHECKOUTS");
  }
  return actual;
}
async function app(path, method = "GET", body) {
  const response = await fetch(new URL(path, base), {
    method, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(315_000),
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  check(response.ok, "APP_HTTP_" + response.status);
  check(response.headers.get("cache-control")?.includes("no-store"), "APP_CACHE_GUARD_MISSING");
  return (await response.json()).data;
}
async function readPreferences() {
  const api = preferenceState.parse(await app("/api/preferences"));
  const row = await data(scoped("user_preferences", "revision,style_dna,body_profile,fit_preferences")
    .single(), "PREFERENCES_READ_FAILED");
  const stored = { ...row.style_dna, ...row.body_profile, ...row.fit_preferences };
  delete stored.skin_depth;
  check(api.revision === row.revision && canonical(api.preferences) === canonical(stored), "APP_DATABASE_PREFERENCES_MISMATCH");
  return api;
}
async function fixture() {
  const draft = await data(scoped("workflow_drafts", "id,revision,payload")
    .eq("id", state.previewDraftId).eq("feature_kind", "preview").eq("status", "active").single(), "FIXTURE_DRAFT_MISSING");
  const api = await app("/api/previews?draftId=" + draft.id);
  check(api.draftId === draft.id && api.revision === draft.revision, "APP_DATABASE_DRAFT_MISMATCH");
  return { ...draft, renderSettings: renderSettings.parse(api.renderSettings) };
}
async function initialize(current) {
  if (state.personalization) return;
  const draft = await fixture();
  const selection = z.object({ top: z.uuid(), bottom: z.uuid() }).parse(draft.payload.selection);
  const operations = await data(scoped("workflow_operations", "id").eq("subject_type", "draft")
    .eq("subject_id", draft.id).limit(1), "FIXTURE_OPERATION_READ_FAILED");
  check(!operations.length && state.budget.image === 0, "UNUSED_SMOKE_FIXTURE_REQUIRED");
  check(Object.values(selection).every((id) => state.wardrobeIds.includes(id)), "RUN_FIXTURE_SELECTION_REQUIRED");
  const items = await data(scoped("wardrobe_items", "id,source_type,import_idempotency_key,asset_id")
    .in("id", Object.values(selection)).eq("inventory_status", "owned").is("archived_at", null), "FIXTURE_ITEMS_READ_FAILED");
  check(items.length === 2 && items.every((item) => item.source_type === "sample" && item.asset_id &&
    item.import_idempotency_key.startsWith("wardrobe-starter.v1:owner4-" + state.runId + "-")), "SAMPLE_FIXTURES_REQUIRED");
  state.personalization = { original: current, lastWritten: null, selection, cases: {} };
  await checkpoint();
  const changed = await data(client.from("workflow_drafts").update({ payload: { selection }, revision: draft.revision + 1 })
    .eq("workspace_id", config.workspaceId).eq("id", draft.id).eq("revision", draft.revision).select("id").maybeSingle(), "FIXTURE_SELECTION_WRITE_FAILED");
  check(changed, "FIXTURE_REVISION_CONFLICT");
}
function profile(name) {
  const swatch = skinSwatchOptions.find((entry) => entry.id === (name === "a" ? "depth_02" : "depth_05"));
  return {
    skinSwatchId: swatch.id, skinSwatchHex: swatch.hex, undertone: "neutral",
    bodyIllustrationGroup: "women", bodyIllustrationId: name === "a" ? "rectangle" : "pear",
    fit: name === "a" ? "regular" : "relaxed",
  };
}
async function applyProfile(name, current) {
  const trial = state.personalization;
  const expected = trial.lastWritten ?? trial.original;
  check(current.revision === expected.revision && canonical(current.preferences) === canonical(expected.preferences), "PREFERENCES_CHANGED_REQUIRES_REVIEW");
  if (name === "quality") {
    check(canonical(current.preferences) === canonical(profile("b")), "QUALITY_REQUIRES_UNCHANGED_PROFILE_B");
    return current;
  }
  const next = profile(name);
  trial.lastWritten = { revision: current.revision + 1, preferences: next };
  await checkpoint();
  const saved = preferenceState.parse(await app("/api/preferences", "PATCH", { expectedRevision: current.revision, preferences: next }));
  check(saved.revision === trial.lastWritten.revision && canonical(saved.preferences) === canonical(next), "PREFERENCE_WRITE_UNCONFIRMED");
  return saved;
}
async function restore(current) {
  const trial = state.personalization;
  check(trial, "PREFERENCE_JOURNAL_MISSING");
  if (trial.restored) return log("preferences_already_restored");
  if (trial.restoreRevision === current.revision && canonical(current.preferences) === canonical(trial.original.preferences)) {
    trial.restored = true;
    await checkpoint();
    return log("preferences_restoration_confirmed");
  }
  const expected = trial.lastWritten ?? trial.original;
  check(current.revision === expected.revision && canonical(current.preferences) === canonical(expected.preferences), "RESTORE_REFUSED_CONCURRENT_PREFERENCE_CHANGE");
  if (trial.lastWritten) {
    trial.restoreRevision = current.revision + 1;
    await checkpoint();
    await app("/api/preferences", "PATCH", { expectedRevision: current.revision, preferences: trial.original.preferences });
    const confirmed = await readPreferences();
    check(confirmed.revision === current.revision + 1 && canonical(confirmed.preferences) === canonical(trial.original.preferences), "RESTORE_UNCONFIRMED");
  }
  trial.restored = true;
  await checkpoint();
  log("preferences_restored");
}
async function runCase(name, output, current) {
  await initialize(current);
  const trial = state.personalization;
  check(!trial.restored && !trial.cases[name], "CASE_ALREADY_RESERVED_OR_RESTORED_NEVER_RESUBMIT");
  check(name === "a" ? !Object.keys(trial.cases).length : trial.cases[name === "b" ? "a" : "b"]?.status === "succeeded", "CASE_ORDER_A_B_QUALITY_REQUIRED");
  const draft = await fixture();
  check(canonical(draft.payload.selection) === canonical(trial.selection), "FIXTURE_SELECTION_CHANGED");
  const settings = draft.renderSettings;
  if (name === "b") check(canonical(settings) === canonical(trial.cases.a.renderSettings), "PROFILE_COMPARISON_SETTINGS_CHANGED");
  if (name === "quality") {
    check(settings.quality === "high" && trial.cases.b.renderSettings.quality !== "high", "RESTART_SERVER_WITH_HIGH_QUALITY_REQUIRED");
    check(canonical(settings) === canonical({ ...trial.cases.b.renderSettings, quality: "high" }), "QUALITY_COMPARISON_SETTINGS_CHANGED");
  }
  const saved = await applyProfile(name, current);
  check(state.budget.image < 3, "THREE_IMAGE_BUDGET_EXHAUSTED");
  const requestId = randomUUID();
  trial.cases[name] = { requestId, status: "reserved", preferenceRevision: saved.revision, renderSettings: settings };
  state.budget.image++;
  await checkpoint();
  const response = await app("/api/previews", "POST", {
    draftId: draft.id, expectedRevision: draft.revision, renderRequestId: requestId,
  });
  const operation = await data(scoped("workflow_operations")
    .eq("id", z.uuid().parse(response.operationId)).eq("kind", "preview_image")
    .eq("subject_type", "draft").eq("subject_id", draft.id).single(), "RESULT_OPERATION_MISSING");
  trial.cases[name].operationId = operation.id;
  trial.cases[name].status = "result_" + operation.status;
  await checkpoint();
  check(operation.status === "succeeded" && operation.attempt_count === 1 && response.renderRequestId === requestId,
    "IMAGE_NOT_SUCCESSFUL_REVIEW_WITHOUT_RESUBMIT");
  check(operation.input.preferences.revision === saved.revision, "RESULT_PREFERENCE_REVISION_MISMATCH");
  check(canonical(renderSettings.parse(operation.input.renderSettings)) === canonical(settings), "RESULT_RENDER_SETTINGS_MISMATCH");
  const captured = { ...operation.input.preferences.style_dna, ...operation.input.preferences.body_profile,
    ...operation.input.preferences.fit_preferences };
  delete captured.skin_depth;
  check(canonical(captured) === canonical(saved.preferences), "RESULT_PREFERENCES_MISMATCH");
  check(equal(operation.input.items.map((item) => item.id).sort(), Object.values(trial.selection).sort()), "RESULT_COMPOSITION_MISMATCH");
  const assetId = z.uuid().parse(operation.result_ref.assetId);
  const asset = await data(scoped("assets", "id,status,bucket,storage_path,mime_type,byte_size")
    .eq("id", assetId).single(), "READY_ASSET_MISSING");
  check(asset.status === "ready" && asset.bucket === "previews" && asset.mime_type === "image/png" &&
    asset.storage_path.startsWith(config.workspaceId + "/" + asset.id + "/"), "READY_PRIVATE_PNG_REQUIRED");
  const bucket = await client.storage.getBucket(asset.bucket);
  check(!bucket.error && bucket.data?.public === false, "PRIVATE_BUCKET_REQUIRED");
  const download = await client.storage.from(asset.bucket).download(asset.storage_path);
  check(!download.error && download.data?.size === asset.byte_size, "IMAGE_DOWNLOAD_FAILED");
  const bytes = Buffer.from(await download.data.arrayBuffer());
  const image = await sharp(bytes).metadata();
  check(image.format === "png" && image.width === 1024 && image.height === 1536, "INVALID_OUTPUT_PNG");
  const file = join(output, "preview-" + name + ".png");
  await writeFile(file, bytes, { flag: "wx", mode: 0o600 });
  const evidence = {
    case: name, operationId: operation.id, assetId, inputRevision: operation.input_revision,
    inputFingerprint: operation.input_fingerprint, renderFingerprint: operation.result_ref.renderFingerprint,
    model: operation.model, promptVersion: operation.prompt_version, schemaVersion: operation.schema_version,
    knowledgeVersion: operation.input.knowledgeVersion, preferences: saved.preferences,
    renderSettings: settings,
    selection: trial.selection, width: image.width, height: image.height, byteSize: bytes.length,
    composition: "Partial composition with sample top and bottom only. Review for invented shoes or other apparel.",
    visualReview: "pending", qualityServerRestartRequired: name === "quality",
  };
  await writeFile(join(output, "preview-" + name + ".json"), JSON.stringify(evidence, null, 2), { flag: "wx", mode: 0o600 });
  Object.assign(trial.cases[name], { assetId, file, status: "succeeded" });
  await checkpoint();
  log("image_downloaded", { case: name, operationId: operation.id, file, visualReview: "pending" });
}
async function main() {
  const { values } = parseArgs({ options: {
    run: { type: "boolean" }, restore: { type: "boolean" }, manifest: { type: "string" },
    "output-dir": { type: "string" }, case: { type: "string" },
    base: { type: "string", default: "http://127.0.0.1:3114" },
  } });
  base = new URL(values.base);
  check(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) &&
    base.port === "3114" && !base.username && !base.password && base.pathname === "/" && !base.search && !base.hash, "LOCAL_PORT_3114_REQUIRED");
  if (values.case) z.enum(["a", "b", "quality"]).parse(values.case);
  if (!values.run) return log("dry_run", {
    usage: "--run --manifest <external smoke journal> --output-dir <existing external directory> --case a|b|quality, or --restore",
    imageBudget: 3,
  });
  check(values.manifest && values["output-dir"] && Boolean(values.case) !== Boolean(values.restore), "CHOOSE_ONE_CASE_OR_RESTORE");
  statePath = await external(values.manifest);
  const output = await external(values["output-dir"]);
  check((await stat(output)).isDirectory(), "OUTPUT_DIRECTORY_REQUIRED");
  const lock = await open(statePath + ".lock", "wx", 0o600);
  try {
    config = parseDatabaseConfig(process.env);
    check(config?.writesEnabled, "WRITABLE_DATABASE_CONFIGURATION_REQUIRED");
    state = journal.parse(JSON.parse(await readFile(statePath, "utf8")));
    check(state.workspaceId === config.workspaceId && state.base === base.origin, "MANIFEST_TARGET_MISMATCH");
    check(state.previewDraftId === seedIdentity(config.workspaceId, "owner4-" + state.runId + "-preview").itemId &&
      state.seedKeys.every((key) => key.startsWith("owner4-" + state.runId + "-")) &&
      equal(state.wardrobeIds, state.seedKeys.map((key) => seedIdentity(config.workspaceId, key).itemId)), "MANIFEST_FIXTURE_IDS_MISMATCH");
    client = createClient(config.url, config.secretKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const workspace = await data(client.from("workspaces").select("name").eq("id", config.workspaceId).single(), "WORKSPACE_READ_FAILED");
    check(workspace.name === "dev-owner-4", "DEV_OWNER_4_REQUIRED");
    const health = await app("/api/health");
    check(health.databaseConfigured && health.writesEnabled, "APP_WRITES_REQUIRED");
    await fixture();
    const current = await readPreferences();
    if (values.restore) await restore(current);
    else await runCase(values.case, output, current);
  } finally {
    await lock.close();
    await unlink(statePath + ".lock");
  }
}
try {
  await main();
} catch (error) {
  log("failed", { code: error instanceof VerificationFailure ? error.message : "VALIDATION_OR_CONNECTION_FAILED_NO_RESUBMIT" });
  process.exitCode = 1;
}
