import "server-only";
import { z } from "zod";
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import { OperationError } from "./errors";
import { workflowProviderLimits, workflowDailyBudgetReset } from "./limits";
import type { OperationClaim } from "./server";

export async function reserveWorkflowProviderCall(claim: OperationClaim) {
  const context = getWorkspaceDatabase();
  const limits = workflowProviderLimits();
  const { error } = await context.client
    .rpc("reserve_workflow_provider_call", {
      p_workspace_id: context.workspaceId,
      p_operation_id: claim.operationId,
      p_attempt: claim.attemptCount,
      p_input_fingerprint: claim.inputFingerprint,
      p_text_daily_limit: limits.textDailyLimit,
      p_image_daily_limit: limits.imageDailyLimit,
    })
    .abortSignal(claim.signal);
  if (
    error?.code === "54000" &&
    error.message === "PROVIDER_DAILY_BUDGET_EXHAUSTED"
  )
    throw new OperationError(
      "PROVIDER_DAILY_BUDGET_EXHAUSTED",
      "The daily provider limit has been reached. This task will resume after the budget resets.",
      429,
      true,
      workflowDailyBudgetReset().retryAfterSeconds,
    );
  if (error)
    throw new OperationError(
      error.code === "55P03"
        ? "PROVIDER_RATE_LIMITED"
        : error.code === "54000"
          ? "PROVIDER_BUDGET_EXHAUSTED"
          : error.code === "40001"
            ? "INPUT_SUPERSEDED"
            : "PROVIDER_NETWORK_ERROR",
      "The provider request could not be reserved. Check the task status.",
      error.code === "40001" ? 409 : 503,
      !["40001", "54000"].includes(error.code),
      error.code === "55P03" ? 10 : undefined,
    );
}

export async function waitForDailyProviderBudget(operation: {
  id: string;
  attempt_count: number;
  input_fingerprint: string;
  result_ref: unknown;
}) {
  const context = getWorkspaceDatabase();
  const { retryAfter } = workflowDailyBudgetReset();
  const result = z.record(z.string(), z.json()).safeParse(operation.result_ref);
  const { error } = await context.client
    .from("workflow_operations")
    .update({
      next_attempt_at: retryAfter,
      safe_error_code: "PROVIDER_DAILY_BUDGET_EXHAUSTED",
      result_ref: {
        ...(result.success ? result.data : {}),
        retryAfter,
        retryable: true,
      },
    })
    .eq("workspace_id", context.workspaceId)
    .eq("id", operation.id)
    .eq("status", "queued")
    .eq("attempt_count", operation.attempt_count)
    .eq("input_fingerprint", operation.input_fingerprint)
    .abortSignal(AbortSignal.timeout(10000));
  if (error)
    throw new OperationError(
      "OPERATION_UNAVAILABLE",
      "The task could not be scheduled after the daily limit.",
      503,
      true,
    );
}

export async function releaseWorkflowProviderCall(claim: OperationClaim) {
  const context = getWorkspaceDatabase();
  const { error } = await context.client
    .rpc("release_workflow_provider_call", {
      p_workspace_id: context.workspaceId,
      p_operation_id: claim.operationId,
      p_attempt: claim.attemptCount,
      p_input_fingerprint: claim.inputFingerprint,
    })
    .abortSignal(AbortSignal.timeout(10000));
  if (error)
    console.warn(
      JSON.stringify({
        event: "provider_slot_release_failed",
        operationId: claim.operationId,
      }),
    );
}
