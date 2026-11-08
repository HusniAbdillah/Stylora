import "server-only";
import { timingSafeEqual } from "node:crypto";
import { OperationError } from "./errors";

export type WorkflowExecutionMode = "inline" | "worker" | "queue";

export function workflowExecutionMode(): WorkflowExecutionMode {
  const mode = process.env.STYLORA_EXECUTION_MODE ?? "inline";
  if (mode !== "inline" && mode !== "worker" && mode !== "queue")
    throw new OperationError(
      "EXECUTOR_CONFIGURATION_INVALID",
      "Task execution is unavailable.",
    );
  if (mode === "worker" && !workerSecret())
    throw new OperationError(
      "EXECUTOR_UNCONFIGURED",
      "Background execution is unavailable.",
    );
  return mode;
}

export function usesWorkflowWorker(): boolean {
  return workflowExecutionMode() === "worker";
}

export function usesBackgroundExecution(): boolean {
  return workflowExecutionMode() !== "inline";
}

function workerSecret() {
  const value = process.env.STYLORA_WORKER_SECRET;
  return value && /^[A-Za-z0-9_-]{43,128}$/.test(value) ? value : null;
}

export function authorizeWorkflowWorker(request: Request): boolean {
  const expected = workerSecret();
  const supplied = request.headers
    .get("authorization")
    ?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
  if (
    !expected ||
    !supplied ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(supplied) ||
    supplied.length !== expected.length
  )
    return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export function executorResponse(response: Response): Response {
  if (!response.ok) return response;
  const mode = workflowExecutionMode();
  if (mode !== "inline") {
    response.headers.set("X-Stylora-Executor", mode);
    if (response.status === 200) {
      return new Response(response.body, {
        status: 202,
        headers: response.headers,
      });
    }
  }
  return response;
}
