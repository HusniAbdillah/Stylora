import "server-only";
import { z } from "zod";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
} from "@/lib/supabase/server";
import { executeQueuedOperation } from "./worker";
import { readOperation } from "./server";
import { canRetryOperationCode } from "./errors";
import { operationLane } from "./worker-policy";
import { workflowExecutionMode } from "./execution-mode";
import { publishWorkflowDispatches } from "./queue-publish";

export const queueMessageSchema = z.strictObject({
  operationId: z.uuid(),
  dispatchId: z.uuid(),
});
export class QueueWait extends Error {
  constructor(readonly afterSeconds: number) {
    super("WORKFLOW_WAITING");
  }
}

export function queueRetry(
  error: unknown,
  metadata: { deliveryCount: number },
) {
  return {
    afterSeconds:
      error instanceof QueueWait
        ? Math.max(5, Math.min(3600, error.afterSeconds))
        : Math.min(900, 5 * 2 ** Math.min(metadata.deliveryCount, 8)),
  };
}

export async function consumeWorkflowMessage(
  input: unknown,
  lane: "text" | "image",
) {
  const parsed = queueMessageSchema.safeParse(input);
  if (!parsed.success) return;
  if (workflowExecutionMode() !== "queue") throw new QueueWait(60);
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const { client, workspaceId } = context;
  const { operationId, dispatchId } = parsed.data;
  async function currentDispatch() {
    const result = await client
      .from("workflow_dispatch_outbox")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("id", dispatchId)
      .eq("operation_id", operationId)
      .eq("is_current", true)
      .abortSignal(AbortSignal.timeout(10000))
      .maybeSingle();
    if (result.error) throw new QueueWait(30);
    return !!result.data;
  }
  if (!(await currentDispatch())) return;
  let operation = await readOperation(operationId);
  if (
    operation.kind === "marketplace_search" ||
    operationLane(operation.kind) !== lane
  )
    return;
  const terminal = () =>
    ["succeeded", "cancelled", "superseded"].includes(operation.status) ||
    (operation.status === "failed" &&
      (operation.attempt_count >= 3 ||
        operation.result_ref?.retryable !== true ||
        !canRetryOperationCode(operation.safe_error_code ?? "")));
  if (terminal()) return;
  const wait = () =>
    Math.max(
      5,
      Math.min(
        86400,
        Math.ceil(
          (Math.max(
            Date.parse(operation.lease_until ?? "") || 0,
            Date.parse(operation.next_attempt_at ?? "") || 0,
          ) -
            Date.now()) /
            1000,
        ),
      ),
    );
  if (
    (Date.parse(operation.lease_until ?? "") || 0) > Date.now() ||
    (Date.parse(operation.next_attempt_at ?? "") || 0) > Date.now()
  )
    throw new QueueWait(wait());
  await executeQueuedOperation(operationId);
  operation = await readOperation(operationId);
  if (terminal()) return;
  if (await currentDispatch()) throw new QueueWait(wait());
  // A fenced transition created a new durable generation; wake it if already due.
  await publishWorkflowDispatches();
}
