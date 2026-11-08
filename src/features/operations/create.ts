import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { setTimeout as delay } from "node:timers/promises";
import { ApiError } from "@/lib/api";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
} from "@/lib/supabase/server";
import { getLookContext } from "@/features/inspiration/server";
import { getPersonalizationSnapshot } from "@/features/preferences/server";
import { calculateMatches, listInventory } from "@/features/matching/backend";
import { matchResultSchema } from "@/features/matching/schema";
import { generateOptions } from "@/features/outfits/backend";
import { optionTypeSchema } from "@/features/outfits/schema";
import {
  confidenceOutputSchema,
  descriptionSchema,
  compactAttributes,
  garmentProvenance,
} from "@/lib/ai/fashion-schema";
import {
  requestFashion,
  withFashionOperation,
  safeProviderError,
  fashionValidationFailure,
} from "@/lib/ai/provider";
import { usesWorkflowWorker } from "./execution-mode";
import { buildFashionPrompt } from "@/prompts/fashion";
import type { Database, Json } from "@/types/database";
import {
  CREATE_RUNTIME_VERSION,
  createKindSchema,
  createInputSnapshot,
  createOperationFingerprint,
  createOperationPolicy,
  matchesCoverCurrentInput,
} from "./create-policy";

type Operation = Database["public"]["Tables"]["workflow_operations"]["Row"];
const kindSchema = createKindSchema;
const requestSchema = z.strictObject({
  kind: kindSchema,
  inventoryMode: z.enum(["sample", "live", "combined"]).default("combined"),
  execute: z.boolean().default(true),
  intentId: z.uuid().optional(),
});
const snapshotSchema = z.object({
  lookId: z.uuid(),
  lookRevision: z.number().int().positive(),
  inventoryMode: z.enum(["sample", "live", "combined"]),
  preferenceFingerprint: z.string().optional(),
  optionType: optionTypeSchema.optional(),
  assetId: z.uuid().optional(),
  runtimeVersion: z.string().optional(),
  intentId: z.uuid().optional(),
  draftId: z.uuid().optional(),
});
const asJson = (value: unknown): Json => z.json().parse(value);

function sqlFailure(error: { code?: string }) {
  if (error.code === "40001" || error.code === "55P03")
    return new ApiError(
      "revision_conflict",
      "The operation changed or is already running. Reload its status.",
      409,
    );
  return new ApiError(
    "operation_persistence_failed",
    "The operation could not be saved. Retry after checking its status.",
    502,
    true,
  );
}

async function readOperation(id: string) {
  z.uuid().parse(id);
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data, error } = await client
    .from("workflow_operations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .abortSignal(AbortSignal.timeout(15000))
    .maybeSingle();
  if (error) throw sqlFailure(error);
  if (!data)
    throw new ApiError(
      "operation_not_found",
      "This operation is unavailable.",
      404,
    );
  return data;
}

function toOperation(op: Operation, currentFingerprint: string | null = null) {
  const input = snapshotSchema.safeParse(op.input);
  return {
    id: op.id,
    kind: op.kind,
    status: op.status,
    inputRevision: op.input_revision,
    inputFingerprint: op.input_fingerprint,
    attemptCount: op.attempt_count,
    resultRef: op.result_ref,
    errorCode: op.safe_error_code,
    model: op.model,
    promptVersion: op.prompt_version,
    schemaVersion: op.schema_version,
    optionType: input.success ? (input.data.optionType ?? null) : null,
    inventoryMode: input.success ? input.data.inventoryMode : null,
    subjectId: op.subject_id,
    leaseUntil: op.lease_until,
    ...createOperationPolicy(op, currentFingerprint),
  };
}
export async function getOperation(id: string) {
  return projectOperation(await readOperation(id));
}

async function operationInput(
  lookId: string,
  kind: z.infer<typeof kindSchema>,
  inventoryMode: "sample" | "live" | "combined",
  optionType?: z.infer<typeof optionTypeSchema>,
  requestedDraftId?: string,
) {
  const { look, pieces } = await getLookContext(lookId);
  const { client, workspaceId } = getWorkspaceDatabase();
  if (!look.inspiration_asset_id)
    throw new ApiError(
      "image_not_ready",
      "Upload and verify an inspiration image first.",
      409,
    );
  const { data: asset } = await client
    .from("assets")
    .select("status")
    .eq("workspace_id", workspaceId)
    .eq("id", look.inspiration_asset_id)
    .eq("bucket", "inspiration")
    .maybeSingle();
  if (asset?.status !== "ready")
    throw new ApiError(
      "image_not_ready",
      "The inspiration image has not been verified.",
      409,
    );
  if (
    ["wardrobe_match", "outfit_options", "option_regeneration"].includes(
      kind,
    ) &&
    !pieces.length
  )
    throw new ApiError(
      "pieces_not_ready",
      "Wait for complete garment descriptions before continuing.",
      409,
    );
  const personalization =
    kind !== "inspiration_description"
      ? await getPersonalizationSnapshot()
      : undefined;
  const inventory = [
    "wardrobe_match",
    "outfit_options",
    "option_regeneration",
  ].includes(kind)
    ? await listInventory(inventoryMode)
    : undefined;
  const input = createInputSnapshot({
    kind,
    look,
    pieces,
    inventoryMode,
    personalization,
    inventory,
    optionType,
    draftId: await requireActiveCreateDraft(look.id, requestedDraftId),
  });
  if (
    ["outfit_options", "option_regeneration"].includes(kind) &&
    inventory &&
    personalization
  )
    await currentMatches(look, pieces, {
      inventoryMode,
      inventoryFingerprint: inventory.fingerprint,
      preferenceFingerprint: personalization.fingerprint,
    });
  return { look, input };
}

async function requireActiveCreateDraft(
  lookId: string,
  capturedId?: string,
  signal = AbortSignal.timeout(15000),
) {
  const { client, workspaceId } = getWorkspaceDatabase();
  let query = client
    .from("workflow_drafts")
    .select("id,status")
    .eq("workspace_id", workspaceId)
    .eq("look_id", lookId)
    .eq("feature_kind", "inspiration");
  query = capturedId
    ? query.eq("id", capturedId)
    : query.eq("status", "active");
  const result = await query.limit(1).abortSignal(signal).maybeSingle();
  if (result.error) throw sqlFailure(result.error);
  if (result.data?.status === "active") return result.data.id;
  if (!capturedId) {
    const existing = await client
      .from("workflow_drafts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("look_id", lookId)
      .eq("feature_kind", "inspiration")
      .limit(1)
      .abortSignal(signal)
      .maybeSingle();
    if (existing.error) throw sqlFailure(existing.error);
    if (!existing.data) return undefined;
  }
  throw new ApiError(
    "input_superseded",
    "This inspiration draft was discarded or replaced. Reopen the current draft.",
    409,
  );
}

async function currentMatches(
  look: { id: string; revision: number },
  pieces: { id: string }[],
  expected: {
    inventoryMode: "sample" | "live" | "combined";
    inventoryFingerprint: string;
    preferenceFingerprint: string;
  },
) {
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data, error } = await client
    .from("wardrobe_matches")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("look_id", look.id)
    .eq("source_revision", look.revision)
    .eq("is_current", true)
    .abortSignal(AbortSignal.timeout(15000));
  if (error) throw sqlFailure(error);
  if (
    !matchesCoverCurrentInput(
      data ?? [],
      pieces.map((piece) => piece.id),
      expected,
    )
  )
    throw new ApiError(
      "matches_not_ready",
      "Complete wardrobe matching for the current pieces and preferences before generating outfits.",
      409,
    );
  return data ?? [];
}

async function projectOperation(op: Operation) {
  let fingerprint: string | null = null;
  const captured = snapshotSchema.safeParse(op.input);
  const kind = kindSchema.safeParse(op.kind);
  if (captured.success && kind.success) {
    try {
      const { look, input } = await operationInput(
        captured.data.lookId,
        kind.data,
        captured.data.inventoryMode,
        captured.data.optionType,
        captured.data.draftId,
      );
      let subjectId = look.id;
      let revision = look.revision;
      if (captured.data.optionType) {
        const { client, workspaceId } = getWorkspaceDatabase();
        const current = await client
          .from("outfit_options")
          .select("id,revision")
          .eq("workspace_id", workspaceId)
          .eq("look_id", look.id)
          .eq("option_type", captured.data.optionType)
          .eq("is_current", true)
          .eq("source_revision", look.revision)
          .maybeSingle();
        if (current.error || !current.data) return toOperation(op);
        subjectId = current.data.id;
        revision = current.data.revision;
      }
      if (captured.data.intentId) input.intentId = captured.data.intentId;
      if (look.source_type !== "sample")
        fingerprint = createOperationFingerprint({
          kind: kind.data,
          input,
          versions: buildFashionPrompt(kind.data).versions,
          model: process.env.OPENAI_MODEL || "gpt-6-luna",
          subjectId,
          revision,
        });
    } catch {
      // Unavailable current inputs disable recovery controls without hiding saved operation state.
    }
  }
  return toOperation(op, fingerprint);
}

export async function startLookOperation(
  lookId: string,
  request: unknown,
  optionType?: z.infer<typeof optionTypeSchema>,
  expectedOptionId?: string,
  draftId?: string,
) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const parsed = requestSchema.parse(request);
  if ((parsed.kind === "option_regeneration") !== Boolean(optionType))
    throw new ApiError(
      "invalid_operation_kind",
      "Use the selected outfit's regeneration endpoint.",
    );
  if (parsed.intentId && parsed.kind !== "option_regeneration")
    throw new ApiError(
      "invalid_operation_intent",
      "A regeneration intent belongs to one outfit direction.",
    );
  const { look, input } = await operationInput(
    lookId,
    parsed.kind,
    parsed.inventoryMode,
    optionType,
    draftId,
  );
  if (look.source_type === "sample")
    throw new ApiError(
      "sample_read_only",
      "Start with your own image to generate new results.",
      409,
    );
  if (parsed.intentId) input.intentId = parsed.intentId;
  let subjectId = look.id;
  let revision = look.revision;
  if (optionType) {
    const { data } = await context.client
      .from("outfit_options")
      .select("id,revision")
      .eq("workspace_id", context.workspaceId)
      .eq("look_id", look.id)
      .eq("option_type", optionType)
      .eq("is_current", true)
      .eq("source_revision", look.revision)
      .maybeSingle();
    if (!data || data.id !== expectedOptionId)
      throw new ApiError(
        "option_not_ready",
        "Generate the outfit direction before regenerating it.",
        409,
      );
    subjectId = data.id;
    revision = data.revision;
  }
  const prompt = buildFashionPrompt(parsed.kind);
  const model = process.env.OPENAI_MODEL || "gpt-6-luna";
  const fingerprint = createOperationFingerprint({
    kind: parsed.kind,
    input,
    versions: prompt.versions,
    model,
    subjectId,
    revision,
  });
  const { data, error } = await context.client.rpc("start_workflow_operation", {
    p_workspace_id: context.workspaceId,
    p_kind: parsed.kind,
    p_subject_type: optionType ? "outfit_option" : "look",
    p_subject_id: subjectId,
    p_input_revision: revision,
    p_input_fingerprint: fingerprint,
    p_input: input,
    p_prompt_version: prompt.versions.promptVersion,
    p_schema_version: "fashion-item.v1",
    p_model: model,
  });
  if (error) throw sqlFailure(error);
  return parsed.execute
    ? executeOperation(data.id)
    : toOperation(data, fingerprint);
}

export async function startDraftOperation(draftId: string, input: unknown) {
  z.uuid().parse(draftId);
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data } = await client
    .from("workflow_drafts")
    .select("look_id")
    .eq("workspace_id", workspaceId)
    .eq("id", draftId)
    .eq("feature_kind", "inspiration")
    .eq("status", "active")
    .maybeSingle();
  if (!data?.look_id)
    throw new ApiError(
      "draft_not_ready",
      "Verify the draft's inspiration image first.",
      409,
    );
  return startLookOperation(data.look_id, input, undefined, undefined, draftId);
}

async function append(op: Operation, type: string, payload: unknown) {
  const { client, workspaceId } = getWorkspaceDatabase();
  const { error } = await client
    .rpc("append_create_event", {
      p_workspace_id: workspaceId,
      p_operation_id: op.id,
      p_attempt: op.attempt_count,
      p_type: type,
      p_payload: asJson(payload),
    })
    .abortSignal(AbortSignal.timeout(10000));
  if (error) throw sqlFailure(error);
}

export async function executeOperation(id: string) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const pending = await readOperation(id);
  const pendingInput = snapshotSchema.safeParse(pending.input);
  if (
    !pendingInput.success ||
    pendingInput.data.runtimeVersion !== CREATE_RUNTIME_VERSION
  )
    throw new ApiError(
      "operation_runtime_changed",
      "This analysis uses an older runtime. Start a new analysis for the current inputs.",
      409,
    );
  if (!kindSchema.safeParse(pending.kind).success)
    throw new ApiError(
      "operation_not_supported",
      "This operation uses another feature's executor.",
      404,
    );
  if (
    ["succeeded", "failed", "cancelled", "superseded"].includes(pending.status)
  )
    return projectOperation(pending);
  const { data: op, error } = await context.client.rpc(
    "claim_workflow_operation",
    {
      p_workspace_id: context.workspaceId,
      p_operation_id: id,
      p_input_revision: pending.input_revision,
      p_lease_seconds: 280,
    },
  );
  if (error) throw sqlFailure(error);
  if (op.status !== "running") return projectOperation(op);
  const snapshot = snapshotSchema.parse(op.input);
  const deadline = Date.now() + 240_000;
  const signal = AbortSignal.timeout(240_000);
  let metadata: unknown = {};
  return withFashionOperation(
    {
      operationId: op.id,
      signal,
      deadline,
      reserveCall: async () => {
        for (let wait = 0; wait < 10; wait++) {
          signal.throwIfAborted();
          const { error: reserveError } = await context.client
            .rpc("reserve_create_provider_call", {
              p_workspace_id: context.workspaceId,
              p_operation_id: id,
              p_attempt: op.attempt_count,
            })
            .abortSignal(signal);
          if (!reserveError) return;
          if (reserveError.code === "55P03") {
            await delay(200, undefined, { signal });
            continue;
          }
          throw new ApiError(
            reserveError.code === "54000"
              ? "provider_budget_exhausted"
              : "input_superseded",
            "The provider request is no longer eligible. Check the operation status.",
            409,
          );
        }
        throw new ApiError(
          "provider_capacity_busy",
          "The workspace provider slots are busy. Retry shortly.",
          503,
          true,
        );
      },
      releaseCall: async () => {
        const { error: releaseError } = await context.client
          .rpc("release_create_provider_call", {
            p_workspace_id: context.workspaceId,
            p_operation_id: id,
            p_attempt: op.attempt_count,
          })
          .abortSignal(AbortSignal.timeout(10000));
        if (releaseError) throw sqlFailure(releaseError);
      },
    },
    async () => {
      try {
        await append(op, "started", { provisional: true });
        await requireActiveCreateDraft(
          snapshot.lookId,
          snapshot.draftId,
          signal,
        );
        const { look, pieces } = await getLookContext(snapshot.lookId, signal);
        if (look.revision !== snapshot.lookRevision)
          throw new ApiError(
            "input_superseded",
            "The inspiration changed before this operation started.",
            409,
          );
        const kind = kindSchema.parse(op.kind);
        const capturedPreferences =
          kind === "inspiration_description"
            ? {}
            : z
                .record(z.string(), z.union([z.string(), z.array(z.string())]))
                .parse(
                  z.object({ preferences: z.unknown() }).parse(op.input)
                    .preferences,
                );
        if (
          kind !== "inspiration_description" &&
          (await getPersonalizationSnapshot()).fingerprint !==
            snapshot.preferenceFingerprint
        )
          throw new ApiError(
            "input_superseded",
            "Preferences changed before this operation started.",
            409,
          );
        let result: unknown;
        if (
          kind === "inspiration_description" ||
          kind === "inspiration_confidence"
        ) {
          const { data: asset } = await context.client
            .from("assets")
            .select("bucket,storage_path,mime_type,status")
            .eq("workspace_id", context.workspaceId)
            .eq("id", look.inspiration_asset_id!)
            .eq("status", "ready")
            .single();
          if (!asset)
            throw new ApiError(
              "image_not_ready",
              "The verified image is unavailable.",
              409,
            );
          const downloaded = await context.client.storage
            .from(asset.bucket)
            .download(asset.storage_path, {}, { signal });
          if (downloaded.error || !downloaded.data)
            throw new ApiError(
              "image_download_failed",
              "The image could not be read for analysis.",
              502,
              true,
            );
          const imageDataUrl = `data:${asset.mime_type};base64,${Buffer.from(await downloaded.data.arrayBuffer()).toString("base64")}`;
          if (kind === "inspiration_description") {
            const pieceIds: string[] = [];
            const response = await requestFashion({
              task: kind,
              schema: descriptionSchema,
              context: {
                occasion: look.occasion,
                sourceRevision: look.revision,
              },
              imageDataUrl,
              onPiece: async (piece, index) => {
                const pieceId = (pieceIds[index] ??= randomUUID());
                await append(op, "piece_completed", {
                  piece: { ...piece, id: pieceId },
                  provisional: true,
                });
              },
            });
            metadata = response.metadata;
            result = {
              pieces: response.data.pieces.map((piece, index) => ({
                ...piece,
                id: pieceIds[index] ?? randomUUID(),
                attributes: compactAttributes(piece.attributes),
                provenance: garmentProvenance(
                  piece,
                  look.inspiration_asset_id,
                  response.metadata.model,
                ),
                position: index,
              })),
            };
          } else {
            const personalization = { preferences: capturedPreferences };
            const response = await requestFashion({
              task: kind,
              schema: confidenceOutputSchema({
                assetId: look.inspiration_asset_id!,
                sourceRevision: look.revision,
                preferenceKeys: Object.keys(personalization.preferences),
                hasOccasion: Boolean(look.occasion),
              }),
              context: {
                reference: {
                  id: look.inspiration_asset_id,
                  image: "Verified uploaded inspiration image",
                },
                occasion: look.occasion,
                preferences: personalization.preferences,
                sourceRevision: look.revision,
                allowedInputs: [
                  "inspiration",
                  ...(look.occasion ? ["occasion"] : []),
                  ...Object.keys(personalization.preferences),
                ],
                evidenceRules:
                  "Image evidence uses source inspiration, id equal to reference.id, path image. Preference evidence uses source preference, id null, path equal to the exact preference key. Occasion evidence uses source context, id null, path occasion. Never cite unavailable piece IDs.",
              },
              imageDataUrl,
            });
            metadata = response.metadata;
            const allowed = new Set([
              "inspiration",
              ...(look.occasion ? ["occasion"] : []),
              ...Object.keys(personalization.preferences),
            ]);
            if (
              response.data.explanation.sourceRevision !== look.revision ||
              response.data.explanation.inputsUsed.some(
                (key) => !allowed.has(key),
              ) ||
              response.data.explanation.whyThis.some((reason) =>
                reason.evidence.some((evidence) =>
                  evidence.source === "inspiration"
                    ? evidence.id !== look.inspiration_asset_id ||
                      evidence.path !== "image"
                    : evidence.source === "preference"
                      ? !Object.hasOwn(
                          personalization.preferences,
                          evidence.path,
                        )
                      : evidence.source !== "context" ||
                        evidence.path !== "occasion" ||
                        !look.occasion,
                ),
              )
            )
              throw fashionValidationFailure("invalid_explanation_evidence", [
                {
                  code: "unsupported_review_reference",
                  path: "explanation.whyThis",
                },
              ]);
            result = response.data;
            await append(op, "confidence_completed", {
              review: response.data,
              provisional: true,
            });
          }
        } else {
          const inventory = await listInventory(snapshot.inventoryMode, signal);
          if (
            inventory.fingerprint !==
            z.object({ inventoryFingerprint: z.string() }).parse(op.input)
              .inventoryFingerprint
          )
            throw new ApiError(
              "input_superseded",
              "Wardrobe inventory changed before this operation started.",
              409,
            );
          const personalization = { preferences: capturedPreferences };
          const matchContext = {
            preferences: personalization.preferences,
            occasion: look.occasion,
            inventoryMode: snapshot.inventoryMode,
            sourceRevision: look.revision,
            onProviderMetadata: (value: unknown) => {
              metadata = value;
            },
          };
          if (kind === "wardrobe_match")
            result = {
              matches: await calculateMatches(
                pieces,
                inventory.items,
                matchContext,
              ),
            };
          else {
            const matches = await currentMatches(look, pieces, {
              inventoryMode: snapshot.inventoryMode,
              inventoryFingerprint: inventory.fingerprint,
              preferenceFingerprint: snapshot.preferenceFingerprint ?? "",
            });
            const parsedMatches = matches.map((match) =>
              matchResultSchema.parse({
                pieceId: match.piece_id,
                wardrobeItemId: match.wardrobe_item_id,
                outcome: match.match_type,
                score: match.confidence,
                sharedAttributes: z
                  .object({ values: z.unknown() })
                  .parse(match.shared_attributes).values,
                differences: z
                  .object({ values: z.unknown() })
                  .parse(match.differences).values,
                rejectedCandidates: match.rejected_candidates,
                evidenceCoverage: match.evidence_coverage,
                explanation: match.explanation,
                sourceType: match.source_type,
              }),
            );
            const options = await generateOptions({
              ...matchContext,
              pieces,
              matches: parsedMatches,
              inventory: inventory.items,
              optionType: snapshot.optionType,
            });
            result = {
              options: options.map((option) => ({
                ...option,
                sourceType:
                  snapshot.inventoryMode === "sample" ? "sample" : "live",
                items: option.items.map((item, position) => ({
                  ...item,
                  position,
                })),
              })),
            };
          }
        }
        const resultMetadata = {
          ...z.record(z.string(), z.json()).parse(metadata),
          preferenceFingerprint: snapshot.preferenceFingerprint ?? null,
          inventoryFingerprint:
            z
              .object({ inventoryFingerprint: z.string().optional() })
              .parse(op.input).inventoryFingerprint ?? null,
          inventoryMode: snapshot.inventoryMode,
        };
        signal.throwIfAborted();
        await requireActiveCreateDraft(
          snapshot.lookId,
          snapshot.draftId,
          signal,
        );
        const { data: finished, error: finishError } = await context.client
          .rpc("finish_create_operation", {
            p_workspace_id: context.workspaceId,
            p_operation_id: id,
            p_attempt: op.attempt_count,
            p_result: asJson(result),
            p_metadata: asJson(resultMetadata),
          })
          .abortSignal(AbortSignal.timeout(10000));
        if (finishError) throw sqlFailure(finishError);
        return projectOperation(finished);
      } catch (failure) {
        const safe = signal.aborted
          ? new ApiError(
              "provider_timeout",
              "The analysis took too long. Check its status before retrying.",
              504,
              true,
            )
          : failure instanceof ApiError
            ? failure
            : new ApiError(
                "operation_failed",
                "The analysis could not finish. Check its status and retry.",
                502,
                true,
              );
        await append(
          op,
          safe.code === "input_superseded" ? "superseded" : "failed",
          { code: safe.code, retryable: safe.retryable },
        ).catch(() => undefined);
        const { error: updateError } = await context.client
          .from("workflow_operations")
          .update({
            status: safe.code === "input_superseded" ? "superseded" : "failed",
            lease_until: null,
            completed_at: new Date().toISOString(),
            safe_error_code: safe.code,
            result_ref: asJson({
              retryable: safe.retryable,
              safeMessage:
                safe.code === "provider_unavailable" ? safe.message : null,
              metadata,
              provider: safeProviderError(failure),
            }),
          })
          .eq("workspace_id", context.workspaceId)
          .eq("id", id)
          .eq("attempt_count", op.attempt_count)
          .in("status", ["running", "partial"])
          .abortSignal(AbortSignal.timeout(10000));
        if (updateError) throw sqlFailure(updateError);
        return toOperation(await readOperation(id));
      }
    },
  );
}

export async function controlOperation(id: string, action: "retry" | "cancel") {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const operation = await readOperation(id);
  if (action === "retry") {
    const policy = await projectOperation(operation);
    if (!policy.canRetry)
      throw new ApiError(
        "operation_retry_unavailable",
        policy.canRestart
          ? "The analysis inputs or runtime changed. Start a new analysis instead."
          : policy.retryBlockedReason === "non_retryable"
            ? "This analysis did not pass validation and cannot be retried unchanged. Change the input or adopt valid pieces manually."
            : "This analysis has no eligible retry remaining. Check its status before continuing.",
        409,
      );
  }
  const { data, error } = await context.client.rpc("control_create_operation", {
    p_workspace_id: context.workspaceId,
    p_operation_id: id,
    p_action: action,
  });
  if (error)
    throw new ApiError(
      "operation_control_unavailable",
      "The operation cannot be changed in its current state.",
      409,
    );
  return action === "retry" && !usesWorkflowWorker()
    ? executeOperation(id)
    : projectOperation(data);
}

export async function getEvents(id: string, after = 0) {
  await readOperation(id);
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data, error } = await client
    .from("workflow_operation_events")
    .select("id,sequence,source_revision,event_type,payload")
    .eq("workspace_id", workspaceId)
    .eq("operation_id", id)
    .gt("sequence", after)
    .order("sequence")
    .limit(100);
  if (error) throw sqlFailure(error);
  return data.map((event) => ({
    eventId: event.id,
    operationId: id,
    sequence: event.sequence,
    sourceRevision: event.source_revision,
    type: event.event_type,
    payload: event.payload,
  }));
}
