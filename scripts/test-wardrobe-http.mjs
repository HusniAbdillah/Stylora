import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseDatabaseConfig } from "../src/lib/config/runtime-schema.ts";

const config = parseDatabaseConfig(process.env);
const workspaceId = "6d68ca94-8165-42a7-9ee3-c5d050371c4a";
const base = process.env.STYLORA_TEST_BASE_URL;
if (
  !config ||
  config.workspaceId !== workspaceId ||
  !config.writesEnabled ||
  !base ||
  !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base) ||
  !process.argv.includes("--with-ai")
)
  throw new Error(
    "Explicit local dev-owner-1 AI smoke configuration is required.",
  );
const client = createClient(config.url, config.secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let draft;
let assetId;
let itemId;
let operationId;
const requireCheck = (condition, code) => {
  if (!condition) throw new Error(code);
};
async function api(path, method = "GET", body) {
  const response = await fetch(`${base}/api/wardrobe${path}`, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(280_000),
  });
  const result = await response.json();
  if (!response.ok || result.error)
    throw new Error(result.error?.code ?? "HTTP_SMOKE_FAILED");
  return result.data;
}
try {
  const source = JSON.parse(
    readFileSync(
      new URL("../data/wardrobe/wardrobe.json", import.meta.url),
      "utf8",
    ),
  ).items.find((item) => item.category === "top");
  const bytes = readFileSync(
    new URL(`../data/wardrobe/images/${source.imageName}`, import.meta.url),
  );
  draft = await api("/drafts", "POST", {});
  const belongs = await client
    .from("workflow_drafts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", draft.id)
    .eq("feature_kind", "wardrobe")
    .single();
  requireCheck(!belongs.error, "SMOKE_WORKSPACE_MISMATCH");
  const upload = await api("/uploads", "POST", {
    draftId: draft.id,
    expectedRevision: draft.revision,
    mimeType: "image/webp",
    byteSize: bytes.length,
  });
  assetId = upload.assetId;
  draft = upload.draft;
  const uploaded = await fetch(upload.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/webp", "x-upsert": "false" },
    body: bytes,
    signal: AbortSignal.timeout(20_000),
  });
  requireCheck(uploaded.ok, "SMOKE_UPLOAD_FAILED");
  draft = await api(`/drafts/${draft.id}/verify`, "POST", {
    assetId,
    expectedRevision: draft.revision,
  });
  const operation = await api(`/drafts/${draft.id}/analyze`, "POST", {
    expectedRevision: draft.revision,
  });
  operationId = operation.id;
  const response = await fetch(
    `${base}/api/wardrobe/operations/${operation.id}/run`,
    { method: "POST", signal: AbortSignal.timeout(280_000) },
  );
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let completed;
  let provisionalPieces = 0;
  while (true) {
    const { value, done } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.type === "piece") {
        requireCheck(
          message.provisional === true && message.piece?.name,
          "SMOKE_PARTIAL_INVALID",
        );
        provisionalPieces++;
      }
      if (message.type === "error")
        throw new Error(message.error?.code ?? "SMOKE_ANALYSIS_FAILED");
      if (message.type === "complete") completed = message.data;
    }
    if (done) break;
  }
  requireCheck(
    completed?.operation.status === "succeeded",
    "SMOKE_OPERATION_NOT_SUCCEEDED",
  );
  draft = completed.draft;
  requireCheck(
    draft.payload.proposals.length > 0 &&
      provisionalPieces > 0 &&
      draft.payload.metadata.promptVersion === "stylora-fashion-v1" &&
      draft.payload.metadata.schemaVersion === "fashion-item.v1",
    "SMOKE_ANALYSIS_CONTRACT_INVALID",
  );
  const proposal = draft.payload.proposals[0];
  const request = {
    expectedRevision: draft.revision,
    proposalId: proposal.id,
    values: proposal.values,
  };
  const confirmed = await api(`/drafts/${draft.id}/confirm`, "POST", request);
  itemId = confirmed.itemId;
  draft = confirmed.draft;
  const repeated = await api(`/drafts/${draft.id}/confirm`, "POST", request);
  requireCheck(repeated.itemId === itemId, "SMOKE_CONFIRMATION_DUPLICATED");
  const detail = await api(`/${itemId}`);
  requireCheck(
    detail.assetId === assetId &&
      detail.sourceType === "live" &&
      detail.inventoryStatus === "owned" &&
      detail.sourceReference.id === itemId,
    "SMOKE_CANONICAL_ITEM_INVALID",
  );
  const image = await fetch(`${base}${detail.imageUrl}`, {
    signal: AbortSignal.timeout(20_000),
  });
  requireCheck(
    image.ok && image.headers.get("content-type")?.includes("image/webp"),
    "SMOKE_ITEM_IMAGE_FAILED",
  );
  const replay = await api(`/drafts/${draft.id}/analyze`, "POST", {
    expectedRevision: draft.revision,
  }).catch(() => null);
  requireCheck(replay === null, "SMOKE_SAVED_DRAFT_REANALYZED");
  const accounting = await client
    .from("workflow_operations")
    .select("provider_call_count")
    .eq("workspace_id", workspaceId)
    .eq("id", operationId)
    .single();
  requireCheck(!accounting.error, "SMOKE_ACCOUNTING_READ_FAILED");
  console.log(
    JSON.stringify({
      result: "passed",
      workspace: "dev-owner-1",
      operationId,
      pieces: draft.payload.proposals.length,
      provisionalPieces,
      model: draft.payload.metadata.model,
      promptVersion: draft.payload.metadata.promptVersion,
      schemaVersion: draft.payload.metadata.schemaVersion,
      providerCalls: accounting.data.provider_call_count,
      usage: draft.payload.metadata.usage,
      fixtureSource: source.imageName,
      paidOperationRetained: true,
    }),
  );
} finally {
  if (itemId) {
    const r = await client
      .from("wardrobe_items")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("id", itemId);
    if (r.error) throw new Error("SMOKE_ITEM_CLEANUP_FAILED");
  }
  if (draft) {
    const r = await client
      .from("workflow_drafts")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("id", draft.id)
      .eq("feature_kind", "wardrobe");
    if (r.error) throw new Error("SMOKE_DRAFT_CLEANUP_FAILED");
  }
  if (assetId) {
    const { data, error } = await client
      .from("assets")
      .select("storage_path")
      .eq("workspace_id", workspaceId)
      .eq("id", assetId)
      .single();
    if (error) throw new Error("SMOKE_ASSET_LOOKUP_FAILED");
    const removed = await client.storage
      .from("wardrobe")
      .remove([data.storage_path]);
    if (removed.error) throw new Error("SMOKE_IMAGE_CLEANUP_FAILED");
    const r = await client
      .from("assets")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("id", assetId);
    if (r.error) throw new Error("SMOKE_ASSET_CLEANUP_FAILED");
  }
  console.log(
    JSON.stringify({
      cleanup: "fixture item, draft and image removed",
      retained: operationId
        ? "paid operation and provisional events for budget accounting"
        : "none",
    }),
  );
}
