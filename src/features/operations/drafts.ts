import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
  type WorkspaceDatabase,
} from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import {
  availableCreateSteps,
  createDraftSchema,
  createSteps,
  draftFeatureSchema,
  inspirationDraftPayloadSchema,
  parseDraftPayload,
  patchDraftSchema,
} from "./drafts-schema";

type DraftRow = Database["public"]["Tables"]["workflow_drafts"]["Row"];

function unavailable(): never {
  throw new ApiError("draft_not_found", "This draft is unavailable.", 404);
}

async function readDraft(context: WorkspaceDatabase, draftId: string) {
  if (!z.uuid().safeParse(draftId).success) unavailable();
  const { data, error } = await context.client
    .from("workflow_drafts")
    .select("*")
    .eq("workspace_id", context.workspaceId)
    .eq("id", draftId)
    .maybeSingle();
  if (error)
    throw new ApiError(
      "draft_read_failed",
      "The draft could not be loaded. Try again.",
      502,
      true,
    );
  if (
    !data ||
    !draftFeatureSchema.safeParse(data.feature_kind).success ||
    data.status === "discarded"
  )
    unavailable();
  return data;
}

function toDraft(row: DraftRow) {
  const featureKind = draftFeatureSchema.parse(row.feature_kind);
  return {
    id: row.id,
    featureKind,
    lookId: row.look_id,
    assetId: row.asset_id,
    currentStep: row.current_step,
    visitedSteps: z.array(z.enum(createSteps)).parse(row.visited_steps),
    payload: parseDraftPayload(featureKind, row.payload),
    status: row.status,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

async function checkReferences(
  context: WorkspaceDatabase,
  featureKind: string,
  lookId: string | null,
  assetId: string | null,
  payload: unknown,
) {
  if (featureKind !== "inspiration") {
    if (lookId || assetId)
      throw new ApiError(
        "invalid_draft_reference",
        "Only inspiration drafts can reference an image or look.",
      );
    return { verified: false, lookStatus: null };
  }
  let lookStatus: string | null = null;
  let verified = false;
  if (lookId) {
    const { data, error } = await context.client
      .from("looks")
      .select("id,status,inspiration_asset_id")
      .eq("workspace_id", context.workspaceId)
      .eq("id", lookId)
      .maybeSingle();
    if (error)
      throw new ApiError(
        "draft_reference_read_failed",
        "The draft references could not be checked.",
        502,
        true,
      );
    if (!data || data.inspiration_asset_id !== assetId) unavailable();
    lookStatus = data.status;
  }
  if (assetId) {
    const { data, error } = await context.client
      .from("assets")
      .select("id,bucket,status")
      .eq("workspace_id", context.workspaceId)
      .eq("id", assetId)
      .in("status", ["pending", "ready"])
      .maybeSingle();
    if (error)
      throw new ApiError(
        "draft_reference_read_failed",
        "The draft references could not be checked.",
        502,
        true,
      );
    if (!data || data.bucket !== "inspiration") unavailable();
    verified = data.status === "ready";
  }
  const piecePayload = inspirationDraftPayloadSchema.parse(payload);
  const pieceIds = [
    ...new Set(
      [piecePayload.activePieceId, piecePayload.pieceDraft?.id].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  if (pieceIds.length) {
    if (!lookId) unavailable();
    const { data, error } = await context.client
      .from("inspiration_pieces")
      .select("id")
      .eq("workspace_id", context.workspaceId)
      .eq("look_id", lookId)
      .in("id", pieceIds)
      .is("removed_at", null);
    if (error)
      throw new ApiError(
        "draft_reference_read_failed",
        "The draft references could not be checked.",
        502,
        true,
      );
    if (data.length !== pieceIds.length) unavailable();
  }
  return { verified, lookStatus };
}

export async function createDraft(input: unknown) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const parsed = createDraftSchema.parse(input);
  const payload = parseDraftPayload(parsed.featureKind, parsed.payload ?? {});
  await checkReferences(
    context,
    parsed.featureKind,
    parsed.lookId ?? null,
    parsed.assetId ?? null,
    payload,
  );
  const inspiration = parsed.featureKind === "inspiration";
  const { data, error } = await context.client
    .from("workflow_drafts")
    .insert({
      workspace_id: context.workspaceId,
      feature_kind: parsed.featureKind,
      look_id: parsed.lookId ?? null,
      asset_id: parsed.assetId ?? null,
      payload,
      current_step: inspiration ? "upload" : null,
      visited_steps: inspiration ? ["upload"] : [],
    })
    .select("*")
    .single();
  if (error)
    throw new ApiError(
      "draft_create_failed",
      "The draft could not be saved. Try again.",
      502,
      true,
    );
  return toDraft(data);
}

export async function getDraft(draftId: string) {
  return toDraft(await readDraft(getWorkspaceDatabase(), draftId));
}

export async function updateDraft(draftId: string, input: unknown) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const parsed = patchDraftSchema.parse(input);
  const row = await readDraft(context, draftId);
  if (row.revision !== parsed.expectedRevision)
    throw new ApiError(
      "revision_conflict",
      "This draft changed. Reload it before saving again.",
      409,
    );
  if (row.status !== "active")
    throw new ApiError("draft_closed", "This draft is already complete.", 409);
  const featureKind = draftFeatureSchema.parse(row.feature_kind);
  const discard = parsed.status === "discarded";
  const payload = discard
    ? {}
    : parseDraftPayload(featureKind, parsed.payload ?? row.payload);
  const lookId = discard
    ? null
    : parsed.lookId === undefined
      ? row.look_id
      : parsed.lookId;
  const assetId = discard
    ? null
    : parsed.assetId === undefined
      ? row.asset_id
      : parsed.assetId;
  const readiness = await checkReferences(
    context,
    featureKind,
    lookId,
    assetId,
    payload,
  );
  let currentStep =
    parsed.currentStep === undefined ? row.current_step : parsed.currentStep;
  let visitedSteps = z.array(z.enum(createSteps)).parse(row.visited_steps);
  if (featureKind === "inspiration" && !discard) {
    const available = availableCreateSteps(
      readiness.verified,
      readiness.lookStatus,
    );
    const requested = parsed.visitedSteps ?? [];
    if (
      !currentStep ||
      !available.includes(z.enum(createSteps).parse(currentStep)) ||
      requested.some((step) => !available.includes(step))
    ) {
      throw new ApiError(
        "step_not_ready",
        "Complete the current step before continuing.",
        409,
      );
    }
    visitedSteps = [
      ...new Set([
        ...visitedSteps,
        ...requested,
        z.enum(createSteps).parse(currentStep),
      ]),
    ];
  } else if (
    featureKind !== "inspiration" &&
    (parsed.currentStep || parsed.visitedSteps?.length)
  ) {
    throw new ApiError(
      "invalid_draft_step",
      "This draft does not have Create steps.",
    );
  }
  if (discard) {
    currentStep = null;
    visitedSteps = [];
  }
  const { data, error } = await context.client
    .from("workflow_drafts")
    .update({
      payload,
      look_id: lookId,
      asset_id: assetId,
      current_step: currentStep,
      visited_steps: visitedSteps,
      status: parsed.status ?? row.status,
      revision: row.revision + 1,
    })
    .eq("workspace_id", context.workspaceId)
    .eq("id", draftId)
    .eq("revision", parsed.expectedRevision)
    .eq("status", "active")
    .select("*")
    .maybeSingle();
  if (error)
    throw new ApiError(
      "draft_save_failed",
      "The draft could not be saved. Try again.",
      502,
      true,
    );
  if (!data)
    throw new ApiError(
      "revision_conflict",
      "This draft changed. Reload it before saving again.",
      409,
    );
  return toDraft(data);
}
