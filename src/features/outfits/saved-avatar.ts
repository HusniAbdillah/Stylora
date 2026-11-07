import "server-only";
import { z } from "zod";
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import {
  IMAGE_MODEL,
  AVATAR_PROMPT_VERSION as FASHION_PROMPT_VERSION,
  FASHION_SCHEMA_VERSION,
} from "@/features/ai/openai";
import {
  assertWorkflowRpc,
  readOperation,
  runOperation,
  OperationError,
} from "@/features/operations/server";
import {
  renderAndStoreAvatar,
  discardPendingAvatar,
  getAvatarRenderSettings,
  normalizeAvatarItems,
} from "@/features/preview/image";
import { imageRenderSettingsSchema } from "@/features/ai/image-settings";
import { buildAvatarVisualDirection } from "@/features/preview/visual-direction";

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
  return runOperation(operation.id, {
    execute: async (claim) => {
      const reuse = shouldReuseSavedAvatar(claim.input);
      const renderSettings = imageRenderSettingsSchema.parse(
        claim.input.renderSettings ?? getAvatarRenderSettings(),
      );
      const visualDirection = buildAvatarVisualDirection(
        snapshot.preference_snapshot,
        items,
      );
      const { data, error } = await context.client
        .from("workflow_operations")
        .update({
          model: IMAGE_MODEL,
          prompt_version: FASHION_PROMPT_VERSION,
          schema_version: FASHION_SCHEMA_VERSION,
          input: z.record(z.string(), z.json()).parse({
            ...claim.input,
            visualDirection,
            renderSettings,
          }),
        })
        .eq("workspace_id", context.workspaceId)
        .eq("id", claim.operationId)
        .eq("attempt_count", claim.attemptCount)
        .eq("status", "running")
        .select("id")
        .maybeSingle();
      if (error || !data)
        throw new OperationError(
          "AVATAR_OPERATION_CHANGED",
          "The image request changed. Reopen the saved look.",
          409,
        );
      return renderAndStoreAvatar({
        items,
        preferences: snapshot.preference_snapshot,
        allowIllustrativeItems: true,
        reuse,
        signal: claim.signal,
        renderSettings,
      });
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
