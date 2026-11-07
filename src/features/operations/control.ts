import "server-only";
import { z } from "zod";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
} from "@/lib/supabase/server";
import { OperationError, readOperation } from "./server";
import { operationRowSchema } from "./schema";

async function controlOperation(
  name: "retry_workflow_operation" | "cancel_workflow_operation",
  operationId: string,
) {
  if (!z.uuid().safeParse(operationId).success)
    throw new OperationError(
      "INVALID_OPERATION_ID",
      "Choose a valid operation.",
      400,
    );
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const { data, error } = await context.client.rpc(name, {
    p_workspace_id: context.workspaceId,
    p_operation_id: operationId,
  });
  if (error?.code === "P0002")
    throw new OperationError(
      "OPERATION_NOT_FOUND",
      "This operation is unavailable.",
      404,
    );
  if (error?.code === "40001" || error?.code === "23514")
    throw new OperationError(
      "OPERATION_CONTROL_CONFLICT",
      "The inputs changed or this action is unavailable. Reload the operation.",
      409,
    );
  if (error?.code === "55P03")
    throw new OperationError(
      "OPERATION_RETRY_DELAYED",
      "Wait before retrying this operation.",
      429,
      true,
      3,
    );
  if (error)
    throw new OperationError(
      "OPERATION_CONTROL_UNAVAILABLE",
      "This action is waiting for database support.",
    );
  return operationRowSchema.parse(data);
}

export async function retryOperation(operationId: string) {
  const operation = await readOperation(operationId);
  if (
    ["queued", "running", "partial"].includes(operation.status) &&
    !operation.cancel_requested_at
  )
    return operation;
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
  return controlOperation("retry_workflow_operation", operationId);
}

export function cancelOperation(operationId: string) {
  return controlOperation("cancel_workflow_operation", operationId);
}
