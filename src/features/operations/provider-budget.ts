import "server-only";
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import { OperationError } from "./errors";
import { workflowProviderLimits } from "./limits";
import type { OperationClaim } from "./server";

export async function reserveWorkflowProviderCall(claim: OperationClaim) {
  const context = getWorkspaceDatabase();
  const limits = workflowProviderLimits();
  const { error } = await context.client.rpc("reserve_workflow_provider_call", {
    p_workspace_id: context.workspaceId, p_operation_id: claim.operationId,
    p_attempt: claim.attemptCount, p_input_fingerprint: claim.inputFingerprint,
    p_text_daily_limit: limits.textDailyLimit, p_image_daily_limit: limits.imageDailyLimit,
  }).abortSignal(claim.signal);
  if (error) throw new OperationError(
    error.code === "55P03" ? "PROVIDER_RATE_LIMITED" : error.code === "54000" ? "PROVIDER_BUDGET_EXHAUSTED" : error.code === "40001" ? "INPUT_SUPERSEDED" : "PROVIDER_NETWORK_ERROR",
    "The provider request could not be reserved. Check the task status.",
    error.code === "40001" ? 409 : 503,
    !["40001", "54000"].includes(error.code),
    error.code === "55P03" ? 10 : undefined,
  );
}

export async function releaseWorkflowProviderCall(claim: OperationClaim) {
  const context = getWorkspaceDatabase();
  const { error } = await context.client.rpc("release_workflow_provider_call", {
    p_workspace_id: context.workspaceId, p_operation_id: claim.operationId,
    p_attempt: claim.attemptCount, p_input_fingerprint: claim.inputFingerprint,
  }).abortSignal(AbortSignal.timeout(10000));
  if (error) console.warn(JSON.stringify({event:"provider_slot_release_failed",operationId:claim.operationId}));
}
