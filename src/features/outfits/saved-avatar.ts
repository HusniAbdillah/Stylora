import "server-only";
import { z } from "zod";
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import {
  IMAGE_MODEL,
  AVATAR_PROMPT_VERSION as FASHION_PROMPT_VERSION,
  FASHION_SCHEMA_VERSION,
  FASHION_KNOWLEDGE_VERSION,
} from "@/features/ai/openai";
import {
  assertWorkflowRpc,
  readOperation,
  runOperation,
  OperationError,
  failOperation,
} from "@/features/operations/server";
import {
  renderAndStoreAvatar,
  discardPendingAvatar,
  getAvatarRenderSettings,
  normalizeAvatarItems,
} from "@/features/preview/image";
import { imageRenderSettingsSchema } from "@/features/ai/image-settings";
import {
  avatarVisualDirectionSchema,
  buildAvatarVisualDirection,
} from "@/features/preview/visual-direction";

const renderContextSchema = z.strictObject({
  version: z.literal("saved-avatar-render.v1"),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  knowledgeVersion: z.string().min(1),
  renderSettings: imageRenderSettingsSchema,
  visualDirection: avatarVisualDirectionSchema,
});

const avatarInputSchema = z
  .object({
    intent: z.literal("regenerate").optional(),
    requestId: z.uuid().optional(),
  })
  .refine((input) => !input.intent || input.requestId !== undefined, {
    path: ["requestId"],
    message: "Regeneration requires a request ID.",
  });

export function shouldReuseSavedAvatar(input: unknown): boolean {
  return avatarInputSchema.parse(input).intent !== "regenerate";
}

export async function runSavedAvatar(operationId: string) {
  const context = getWorkspaceDatabase();
  const operation = await readOperation(operationId);
  if (
    operation.kind !== "saved_avatar" ||
    operation.subject_type !== "saved_look"
  ) {
    throw new OperationError(
      "AVATAR_OPERATION_NOT_FOUND",
      "This saved image is unavailable.",
      404,
    );
  }
  const { data: snapshot, error } = await context.client
    .from("saved_look_snapshots")
    .select("id,items,preference_snapshot")
    .eq("workspace_id", context.workspaceId)
    .eq("id", operation.subject_id)
    .maybeSingle();
  if (error || !snapshot)
    throw new OperationError(
      "SAVED_LOOK_NOT_FOUND",
      "This saved look is unavailable.",
      404,
    );
  const items = normalizeAvatarItems(
    z.array(z.record(z.string(), z.unknown())).min(1).parse(snapshot.items),
  );
  await assertWorkflowRpc("complete_saved_avatar");
  let renderContext: z.infer<typeof renderContextSchema> | undefined;
  return runOperation(operation.id, {
    execute: async (claim) => {
      const reuse = shouldReuseSavedAvatar(claim.input);
      const visualDirection = buildAvatarVisualDirection(
        snapshot.preference_snapshot,
        items,
      );
      const current = await readOperation(claim.operationId);
      let captured: unknown = current.result_ref?.renderContext;
      if (!captured) {
        const history = await context.client
          .from("workflow_operation_events")
          .select("payload")
          .eq("workspace_id", context.workspaceId)
          .eq("operation_id", claim.operationId)
          .eq("source_revision", claim.inputRevision)
          .eq("event_type", "started")
          .contains("payload", { inputFingerprint: claim.inputFingerprint })
          .order("sequence", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (history.error)
          throw new OperationError(
            "AVATAR_CONTEXT_UNAVAILABLE",
            "The captured image settings are unavailable.",
          );
        captured = z
          .object({ savedAvatarRenderContext: z.unknown().optional() })
          .parse(history.data?.payload ?? {}).savedAvatarRenderContext;
      }
      if (!captured && claim.attemptCount > 1)
        throw new OperationError(
          "AVATAR_CONTEXT_UNAVAILABLE",
          "Create a new image request to capture its settings.",
          409,
        );
      const parsedContext = renderContextSchema.safeParse(
        captured ?? {
          version: "saved-avatar-render.v1",
          model: IMAGE_MODEL,
          promptVersion: FASHION_PROMPT_VERSION,
          schemaVersion: FASHION_SCHEMA_VERSION,
          knowledgeVersion: FASHION_KNOWLEDGE_VERSION,
          renderSettings:
            claim.input.renderSettings ?? getAvatarRenderSettings(),
          visualDirection,
        },
      );
      if (!parsedContext.success)
        throw new OperationError(
          "AVATAR_RUNTIME_CHANGED",
          "The saved image settings use an older runtime. Request a new image.",
          409,
        );
      renderContext = parsedContext.data;
      if (
        renderContext.model !== IMAGE_MODEL ||
        renderContext.promptVersion !== FASHION_PROMPT_VERSION ||
        renderContext.schemaVersion !== FASHION_SCHEMA_VERSION ||
        renderContext.knowledgeVersion !== FASHION_KNOWLEDGE_VERSION ||
        JSON.stringify(renderContext.visualDirection) !==
          JSON.stringify(visualDirection)
      )
        throw new OperationError(
          "AVATAR_RUNTIME_CHANGED",
          "The image runtime changed. Request a new image.",
          409,
        );
      const { data, error } = await context.client
        .from("workflow_operations")
        .update({
          model: IMAGE_MODEL,
          prompt_version: FASHION_PROMPT_VERSION,
          schema_version: FASHION_SCHEMA_VERSION,
          result_ref: z
            .record(z.string(), z.json())
            .parse({ ...current.result_ref, renderContext }),
        })
        .eq("workspace_id", context.workspaceId)
        .eq("id", claim.operationId)
        .eq("attempt_count", claim.attemptCount)
        .eq("input_fingerprint", claim.inputFingerprint)
        .eq("status", "running")
        .gt("lease_until", new Date().toISOString())
        .is("cancel_requested_at", null)
        .select("id")
        .maybeSingle();
      if (error || !data)
        throw new OperationError(
          "AVATAR_OPERATION_CHANGED",
          "The image request changed. Reopen the saved look.",
          409,
        );
      const recorded = await context.client
        .rpc("stylora_record_operation_event", {
          p_workspace_id: context.workspaceId,
          p_operation_id: claim.operationId,
          p_event_type: "started",
          p_payload: z
            .json()
            .parse({
              inputFingerprint: claim.inputFingerprint,
              savedAvatarRenderContext: renderContext,
            }),
        })
        .abortSignal(AbortSignal.timeout(15000));
      if (recorded.error)
        throw new OperationError(
          "AVATAR_CONTEXT_PERSIST_FAILED",
          "The image settings could not be captured. Request a new image.",
          503,
        );
      claim.signal.throwIfAborted();
      return renderAndStoreAvatar({
        items,
        preferences: snapshot.preference_snapshot,
        allowIllustrativeItems: true,
        reuse,
        signal: claim.signal,
        renderSettings: renderContext.renderSettings,
      });
    },
    async fail(claim, failure) {
      await failOperation(claim, failure);
      if (!renderContext) return;
      const finished = await readOperation(claim.operationId);
      if (
        finished.status !== "failed" ||
        finished.attempt_count !== claim.attemptCount ||
        finished.input_fingerprint !== claim.inputFingerprint
      )
        return;
      const saved = await context.client
        .from("workflow_operations")
        .update({
          result_ref: z
            .record(z.string(), z.json())
            .parse({ ...finished.result_ref, renderContext }),
        })
        .eq("workspace_id", context.workspaceId)
        .eq("id", claim.operationId)
        .eq("attempt_count", claim.attemptCount)
        .eq("input_fingerprint", claim.inputFingerprint)
        .eq("status", "failed")
        .eq("updated_at", finished.updated_at)
        .is("lease_until", null)
        .is("cancel_requested_at", null)
        .select("id")
        .maybeSingle();
      if (saved.error || !saved.data)
        throw new OperationError(
          "AVATAR_CONTEXT_PERSIST_FAILED",
          "The image settings could not be preserved. Request a new image.",
          503,
        );
    },
    async commit(claim, output) {
      try {
        const { data, error } = await context.client
          .rpc("complete_saved_avatar", {
            p_workspace_id: context.workspaceId,
            p_operation_id: claim.operationId,
            p_attempt_count: claim.attemptCount,
            p_input_fingerprint: claim.inputFingerprint,
            p_output_asset_id: output.assetId,
            p_render_fingerprint: output.renderFingerprint,
          })
          .abortSignal(AbortSignal.timeout(15000));
        if (error)
          throw new OperationError(
            "AVATAR_COMMIT_FAILED",
            "The saved image could not be attached. Try again.",
            503,
            true,
          );
        const committed = z.object({ status: z.string() }).parse(data);
        if (committed.status !== "succeeded" && output.createdAsset)
          await discardPendingAvatar(output.assetId);
      } catch (failure) {
        if (output.createdAsset) await discardPendingAvatar(output.assetId);
        throw failure;
      }
    },
  });
}
