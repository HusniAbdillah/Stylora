import "server-only";
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import { usesWorkflowWorker } from "./execution-mode";
import { OperationError } from "./errors";

export async function workflowWorkerHealth() {
  const context = getWorkspaceDatabase();
  const { data, error } = await context.client
    .from("workflow_worker_heartbeats")
    .select("last_seen_at,active_jobs")
    .eq("workspace_id", context.workspaceId)
    .gt("last_seen_at", new Date(Date.now() - 90000).toISOString())
    .order("last_seen_at", { ascending: false })
    .limit(10)
    .abortSignal(AbortSignal.timeout(5000));
  return {
    available: !error && !!data?.length,
    workers: error ? 0 : (data?.length ?? 0),
  };
}

export async function assertWorkflowExecutorAvailable() {
  if (!usesWorkflowWorker()) return;
  if (!(await workflowWorkerHealth()).available)
    throw new OperationError(
      "EXECUTOR_OFFLINE",
      "Background tasks are temporarily unavailable. Your draft is saved. Try again shortly.",
      503,
      true,
      30,
    );
}
