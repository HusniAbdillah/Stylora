import "server-only";
import { z } from "zod";
import { readDatabaseConfig } from "@/lib/config/server";
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import {
  assertWorkflowRpc,
  readOperation,
  runOperation,
  OperationError,
} from "@/features/operations/server";
import {
  renderAndStoreAvatar,
  discardPendingAvatar,
} from "@/features/preview/image";

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
  const items = z
    .array(z.record(z.string(), z.unknown()))
    .min(1)
    .parse(snapshot.items);
  await assertWorkflowRpc("complete_saved_avatar");
  return runOperation(operation.id, {
    execute: (claim) =>
      renderAndStoreAvatar({
        items,
        preferences: snapshot.preference_snapshot,
        allowIllustrativeItems: true,
        signal: claim.signal,
      }),
    async commit(claim, output) {
      try {
        const config = readDatabaseConfig();
        if (!config) throw new Error("WORKSPACE_CONFIGURATION_UNAVAILABLE");
        const response = await fetch(
          `${config.url}/rest/v1/rpc/complete_saved_avatar`,
          {
            method: "POST",
            headers: {
              apikey: config.secretKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              p_workspace_id: context.workspaceId,
              p_operation_id: claim.operationId,
              p_attempt_count: claim.attemptCount,
              p_input_fingerprint: claim.inputFingerprint,
              p_output_asset_id: output.assetId,
              p_render_fingerprint: output.renderFingerprint,
            }),
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          },
        );
        if (!response.ok)
          throw new OperationError(
            "AVATAR_COMMIT_FAILED",
            "The saved image could not be attached. Try again.",
            503,
            true,
          );
        const committed = z
          .object({ status: z.string() })
          .parse(await response.json());
        if (committed.status !== "succeeded" && output.createdAsset)
          await discardPendingAvatar(output.assetId);
      } catch (failure) {
        if (output.createdAsset) await discardPendingAvatar(output.assetId);
        throw failure;
      }
    },
  });
}
