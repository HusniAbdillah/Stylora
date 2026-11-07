import "server-only";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
} from "@/lib/supabase/server";
import { OperationError, readOperation } from "./server";
import { canRetryOperationCode } from "./errors";

export async function retryOperation(operationId: string) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const operation = await readOperation(operationId);
  if (
    operation.status === "queued" ||
    operation.status === "running" ||
    operation.status === "partial"
  )
    return operation;
  if (
    operation.status !== "failed" ||
    operation.attempt_count >= 3 ||
    !canRetryOperationCode(operation.safe_error_code ?? "") ||
    operation.result_ref?.retryable === false
  ) {
    throw new OperationError(
      "OPERATION_RETRY_UNAVAILABLE",
      "Change the inputs before starting this operation again.",
      409,
    );
  }
  const retryAt = operation.result_ref?.retryAfter;
  if (typeof retryAt === "string" && Date.parse(retryAt) > Date.now()) {
    throw new OperationError(
      "OPERATION_RETRY_DELAYED",
      "Wait before retrying this operation.",
      429,
      true,
      Math.ceil((Date.parse(retryAt) - Date.now()) / 1000),
    );
  }
  const { data, error } = await context.client
    .from("workflow_operations")
    .update({
      status: "queued",
      lease_until: null,
      completed_at: null,
      safe_error_code: null,
      cancel_requested_at: null,
      result_ref: null,
    })
    .eq("workspace_id", context.workspaceId)
    .eq("id", operation.id)
    .eq("status", "failed")
    .eq("attempt_count", operation.attempt_count)
    .select("id")
    .maybeSingle();
  if (error || !data)
    throw new OperationError(
      "OPERATION_RETRY_CONFLICT",
      "The operation changed. Reload its status.",
      409,
    );
  return readOperation(operation.id);
}

export async function cancelOperation(operationId: string) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const operation = await readOperation(operationId);
  if (!["queued", "running", "partial"].includes(operation.status))
    return operation;
  const now = new Date().toISOString();
  const update =
    operation.status === "queued"
      ? {
          status: "cancelled",
          completed_at: now,
          cancel_requested_at: now,
          lease_until: null,
        }
      : { cancel_requested_at: now };
  const { error } = await context.client
    .from("workflow_operations")
    .update(update)
    .eq("workspace_id", context.workspaceId)
    .eq("id", operation.id)
    .eq("status", operation.status)
    .eq("attempt_count", operation.attempt_count);
  if (error)
    throw new OperationError(
      "OPERATION_CANCEL_UNAVAILABLE",
      "The cancellation could not be saved. Try again.",
      503,
      true,
    );
  return readOperation(operation.id);
}
