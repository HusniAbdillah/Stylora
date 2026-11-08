import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
} from "@/lib/supabase/server";
import {
  verifyWorkspaceStorageAsset,
  readVerifiedWorkspaceStorageAsset,
} from "@/lib/supabase/storage";
import {
  descriptionSchema,
  canonicalDescriptionSchema,
  type Garment,
} from "@/lib/ai/fashion-schema";
import { getFashionTaskSettings } from "@/lib/ai/task-settings";
import {
  reserveWorkflowProviderCall,
  releaseWorkflowProviderCall,
} from "@/features/operations/provider-budget";
import {
  requestFashion,
  safeProviderError,
  withFashionOperation,
} from "@/lib/ai/provider";
import { buildFashionPrompt } from "@/prompts/fashion";
import {
  fingerprintOperationInput,
  OperationError,
  operationStatus,
  readOperation,
  runOperation,
  startOperation,
} from "@/features/operations/server";
import { draftPayloadSchema, revisionSchema } from "./schema";
import { usesWorkflowWorker } from "@/features/operations/execution-mode";
import {
  getWardrobeDraft,
  readWardrobeDraftRow,
  wardrobeDatabaseError,
} from "./server";

export async function startWardrobeAnalysis(draftId: string, input: unknown) {
  const { expectedRevision } = z
    .strictObject({ expectedRevision: revisionSchema })
    .parse(input);
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const draft = await getWardrobeDraft(draftId);
  const occasion = z
    .string()
    .trim()
    .max(120)
    .nullish()
    .safeParse(draft.payload.metadata.occasion);
  if (!occasion.success)
    throw new ApiError(
      "occasion_invalid",
      "Use an occasion of at most 120 characters.",
      400,
    );
  if (
    draft.status !== "active" ||
    draft.revision !== expectedRevision ||
    !draft.assetId ||
    Object.keys(draft.payload.saved).length
  )
    throw new ApiError(
      "draft_not_ready",
      "Upload a photo and finish saving your edits before requesting a description.",
      409,
    );
  const verified = await verifyWorkspaceStorageAsset(draft.assetId);
  if (verified.bucket !== "wardrobe") wardrobeDatabaseError({ code: "P0002" });
  const prompt = buildFashionPrompt("inspiration_description");
  const providerSettings = getFashionTaskSettings("wardrobe_description");
  const model = providerSettings.model;
  const snapshot = {
    draftRevision: draft.revision,
    assetId: draft.assetId,
    occasion: occasion.data || null,
    versions: prompt.versions,
    model,
    providerSettings,
    handlerVersion: "wardrobe-description.v4",
  };
  const op = await startOperation({
    kind: "wardrobe_description",
    subjectType: "draft",
    subjectId: draft.id,
    inputRevision: draft.revision,
    inputFingerprint: fingerprintOperationInput(snapshot),
    input: z.record(z.string(), z.json()).parse(snapshot),
    promptVersion: prompt.versions.promptVersion,
    schemaVersion: prompt.versions.schemaVersion,
    model,
  });
  if (op.status === "failed") {
    const { error } = await context.client.rpc("retry_wardrobe_description", {
      p_workspace_id: context.workspaceId,
      p_operation_id: op.id,
    });
    if (error) wardrobeDatabaseError(error);
  }
  return operationStatus(await readOperation(op.id));
}
export async function executeWardrobeAnalysis(
  operationId: string,
  onPiece?: (piece: Garment, index: number) => void,
) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const operation = await readOperation(operationId);
  const occasion = z
    .string()
    .trim()
    .max(120)
    .nullish()
    .safeParse(operation.input.occasion);
  if (!occasion.success)
    throw new ApiError(
      "occasion_invalid",
      "The captured occasion is invalid. Start a new description.",
      400,
    );
  if (
    operation.kind !== "wardrobe_description" ||
    operation.subject_type !== "draft"
  )
    wardrobeDatabaseError({ code: "P0002" });
  const metadataSchema = z.record(z.string(), z.json());
  type Output = {
    data: z.infer<typeof canonicalDescriptionSchema>;
    metadata: z.infer<typeof metadataSchema>;
  };
  async function assertCurrent(
    claim: import("@/features/operations/server").OperationClaim,
  ) {
    const draft = await readWardrobeDraftRow(operation.subject_id);
    const settings = getFashionTaskSettings("wardrobe_description");
    const prompt = buildFashionPrompt("inspiration_description");
    if (
      draft.revision !== claim.inputRevision ||
      draft.status !== "active" ||
      draft.asset_id !== claim.input.assetId ||
      claim.input.handlerVersion !== "wardrobe-description.v4" ||
      fingerprintOperationInput(claim.input.providerSettings) !==
        fingerprintOperationInput(settings) ||
      fingerprintOperationInput(claim.input.versions) !==
        fingerprintOperationInput(prompt.versions) ||
      fingerprintOperationInput(claim.input) !== claim.inputFingerprint
    )
      throw new OperationError(
        "INPUT_SUPERSEDED",
        "The draft or analysis settings changed. Start the current description.",
        409,
      );
    return { draft, settings };
  }
  const result = await runOperation<Output>(operationId, {
    checkpoint: {
      serialize: (output) => ({
        result: z.json().parse(output.data),
        metadata: output.metadata,
      }),
      restore: async (claim, result, metadata) => {
        const { settings } = await assertCurrent(claim);
        const parsed = metadataSchema.parse(metadata);
        if (
          fingerprintOperationInput(parsed.providerSettings) !==
          fingerprintOperationInput(settings)
        )
          throw new OperationError(
            "INPUT_SUPERSEDED",
            "The captured description settings changed.",
            409,
          );
        return {
          data: canonicalDescriptionSchema.parse(result),
          metadata: parsed,
        };
      },
    },
    execute: async (claim) => {
      const { draft, settings } = await assertCurrent(claim);
      if (
        draft.revision !== claim.inputRevision ||
        draft.status !== "active" ||
        draft.asset_id !== claim.input.assetId
      )
        throw new OperationError(
          "INPUT_SUPERSEDED",
          "The draft changed. Reload it before retrying.",
          409,
        );
      const verified = await readVerifiedWorkspaceStorageAsset(
        draft.asset_id!,
        { signal: claim.signal, readyOnly: true },
      );
      if (verified.bucket !== "wardrobe")
        throw new OperationError(
          "WARDROBE_IMAGE_UNAVAILABLE",
          "The photo is unavailable.",
        );
      const imageDataUrl = `data:${verified.mimeType};base64,${Buffer.from(verified.bytes).toString("base64")}`;
      try {
        const output = await withFashionOperation(
          {
            operationId,
            signal: claim.signal,
            deadline: Date.now() + 210_000,
            providerSettings: settings,
            reserveCall: async () => {
              await reserveWorkflowProviderCall(claim);
            },
            releaseCall: async () => {
              await releaseWorkflowProviderCall(claim);
            },
          },
          () =>
            requestFashion({
              task: "inspiration_description",
              schema: descriptionSchema,
              context: {
                purpose:
                  "Describe garments for an owned wardrobe intake. These are proposed descriptions until the visitor confirms each item.",
                assetId: draft.asset_id,
                occasion: occasion.data || null,
                sourceRevision: draft.revision,
              },
              imageDataUrl,
              onPiece: async (piece, index) => {
                const { error } = await context.client.rpc(
                  "append_wardrobe_piece",
                  {
                    p_workspace_id: context.workspaceId,
                    p_operation_id: operationId,
                    p_attempt: claim.attemptCount,
                    p_payload: z.json().parse({
                      piece,
                      index,
                      provisional: true,
                      attemptCount: claim.attemptCount,
                    }),
                  },
                );
                if (error) wardrobeDatabaseError(error);
                onPiece?.(piece, index);
              },
            }),
        );
        return {
          data: canonicalDescriptionSchema.parse(output.data),
          metadata: metadataSchema.parse(
            JSON.parse(JSON.stringify(output.metadata)),
          ),
        };
      } catch (error) {
        const failure = safeProviderError(error);
        if (failure)
          throw new OperationError(
            failure.code.toUpperCase(),
            "Photo description could not finish. Retry or enter the details manually.",
            503,
            failure.retryable,
          );
        throw error;
      }
    },
    commit: async (claim, output) => {
      await assertCurrent(claim);
      const payload = draftPayloadSchema.parse({
        version: "wardrobe-draft.v1",
        mode: "live",
        proposals: output.data.pieces.map((piece) => ({
          id: randomUUID(),
          values: {
            name: piece.name,
            category: piece.category,
            subcategory: piece.subcategory,
            description: piece.description,
            attributes: piece.attributes,
          },
          original: piece,
        })),
        saved: {},
        metadata: z.json().parse({
          ...output.metadata,
          occasion: occasion.data || null,
          extractionTask: "inspiration_description",
        }),
      });
      const { error } = await context.client.rpc(
        "finish_wardrobe_description",
        {
          p_workspace_id: context.workspaceId,
          p_operation_id: operationId,
          p_attempt: claim.attemptCount,
          p_fingerprint: claim.inputFingerprint,
          p_payload: z.json().parse(payload),
        },
      );
      if (error) wardrobeDatabaseError(error);
    },
  });
  return {
    operation: operationStatus(result),
    draft: await getWardrobeDraft(operation.subject_id),
  };
}

export async function getWardrobeAnalysis(draftId: string) {
  const draft = await readWardrobeDraftRow(draftId);
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data, error } = await client
    .from("workflow_operations")
    .select("id,lease_until")
    .eq("workspace_id", workspaceId)
    .eq("kind", "wardrobe_description")
    .eq("subject_type", "draft")
    .eq("subject_id", draft.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) wardrobeDatabaseError(error);
  if (!data)
    return {
      operation: null,
      leaseExpired: false,
      executionMode: usesWorkflowWorker() ? "worker" : "inline",
    };
  const operation = await readOperation(data.id);
  let provisionalCount = 0;
  if (operation.status === "partial") {
    const events = await client
      .from("workflow_operation_events")
      .select("payload")
      .eq("workspace_id", workspaceId)
      .eq("operation_id", operation.id)
      .eq("event_type", "piece_completed")
      .contains("payload", { attemptCount: operation.attempt_count })
      .order("sequence", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (events.error) wardrobeDatabaseError(events.error);
    const latestPiece = z
      .object({
        index: z.number().int().min(0).max(23),
        provisional: z.literal(true),
      })
      .safeParse(events.data?.payload);
    if (latestPiece.success) provisionalCount = latestPiece.data.index + 1;
  }
  return {
    operation: operationStatus(operation),
    executionMode: usesWorkflowWorker() ? "worker" : "inline",
    provisionalCount,
    leaseExpired:
      data.lease_until !== null && Date.parse(data.lease_until) <= Date.now(),
  };
}
