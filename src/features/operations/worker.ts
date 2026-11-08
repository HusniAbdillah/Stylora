import "server-only";
import { ApiError } from "@/lib/api";
import { ZodError } from "zod";
import { OperationError } from "./errors";
import { executeOperation } from "./create";
import { runCapsuleOperation } from "@/features/capsules/generate";
import { runPreviewOperation } from "@/features/preview/generation";
import { runSavedAvatar } from "@/features/outfits/saved-avatar";
import { executeWardrobeAnalysis } from "@/features/wardrobe/analysis";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
} from "@/lib/supabase/server";
import { operationStatus, readOperation, runOperation } from "./server";
import { createOperationKinds } from "./worker-policy";
import { operationRowSchema } from "./schema";

export async function executeQueuedOperation(id: string) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  let operation = await readOperation(id);
  if (
    operation.status === "failed" &&
    operation.safe_error_code &&
    operation.attempt_count < 3 &&
    operation.result_ref?.retryable === true
  ) {
    const { data, error } = await context.client.rpc(
      "defer_workflow_operation",
      {
        p_workspace_id: context.workspaceId,
        p_operation_id: id,
        p_attempt_count: operation.attempt_count,
        p_input_fingerprint: operation.input_fingerprint,
        p_safe_error_code: operation.safe_error_code,
      },
    );
    if (!error) operation = readDeferred(data);
    else if (!["23514", "40001", "P0002"].includes(error.code))
      throw new OperationError(
        "RECOVERY_UNAVAILABLE",
        "Task recovery is temporarily unavailable.",
        503,
        true,
      );
  }
  if (
    ["succeeded", "failed", "superseded", "cancelled"].includes(
      operation.status,
    )
  )
    return operationStatus(operation);
  if (operation.lease_until && Date.parse(operation.lease_until) > Date.now())
    return operationStatus(operation);
  try {
    if ((createOperationKinds as readonly string[]).includes(operation.kind)) {
      try {
        return await executeOperation(id);
      } catch (error) {
        if (
          !(error instanceof ApiError) ||
          error.code !== "operation_runtime_changed"
        )
          throw error;
        // An old queued snapshot cannot be executed by a newer Create runtime.
        await context.client
          .from("workflow_operations")
          .update({
            status: "superseded",
            lease_until: null,
            completed_at: new Date().toISOString(),
            safe_error_code: "INPUT_SUPERSEDED",
          })
          .eq("workspace_id", context.workspaceId)
          .eq("id", id)
          .eq("input_fingerprint", operation.input_fingerprint)
          .eq("status", operation.status)
          .or(`status.eq.queued,lease_until.lte.${new Date().toISOString()}`)
          .eq("updated_at", operation.updated_at)
          .throwOnError();
        return operationStatus(await readOperation(id));
      }
    }
    switch (operation.kind) {
      case "capsule_generation":
        return operationStatus(await runCapsuleOperation(id));
      case "preview_image":
        return operationStatus(await runPreviewOperation(id));
      case "saved_avatar":
        return operationStatus(await runSavedAvatar(id));
      case "wardrobe_description":
        return (await executeWardrobeAnalysis(id)).operation;
      default:
        throw new ApiError(
          "operation_not_supported",
          "This task uses another executor.",
          409,
        );
    }
  } catch (error) {
    if (
      !(error instanceof ZodError) &&
      !(
        (error instanceof ApiError || error instanceof OperationError) &&
        error.status === 404
      )
    )
      throw error;
    const code =
      error instanceof ZodError
        ? "OPERATION_INPUT_INVALID"
        : error.code.toUpperCase();
    return operationStatus(
      await runOperation(id, {
        execute: async () => {
          throw new OperationError(
            code,
            "The captured task input is unavailable.",
            409,
          );
        },
        commit: async () => {
          throw new Error("Unreachable input failure commit");
        },
      }),
    );
  }
}

function readDeferred(value: unknown) {
  return operationRowSchema.parse(value);
}
