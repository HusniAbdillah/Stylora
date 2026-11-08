import "server-only";
import { z } from "zod";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
} from "@/lib/supabase/server";
import { OperationError } from "./errors";
import type { OperationClaim } from "./server";

export type CheckpointJson = z.infer<ReturnType<typeof z.json>>;
export type OperationCheckpoint = {
  result: CheckpointJson;
  metadata?: CheckpointJson;
};

export async function readOperationCheckpoint(claim: OperationClaim) {
  const context = getWorkspaceDatabase();
  const { data, error } = await context.client
    .from("operation_result_checkpoints")
    .select("result,metadata")
    .eq("workspace_id", context.workspaceId)
    .eq("operation_id", claim.operationId)
    .eq("input_fingerprint", claim.inputFingerprint)
    .abortSignal(AbortSignal.timeout(10000))
    .maybeSingle();
  if (error)
    throw new OperationError(
      "CHECKPOINT_UNAVAILABLE",
      "The saved task result could not be loaded.",
      503,
      true,
    );
  return data
    ? z.object({ result: z.json(), metadata: z.json() }).parse(data)
    : null;
}

export async function checkpointOperationResult(
  claim: OperationClaim,
  output: OperationCheckpoint,
) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const result = z.json().parse(output.result);
  const metadata = z.json().parse(output.metadata ?? {});
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await context.client
      .rpc("checkpoint_workflow_result", {
        p_workspace_id: context.workspaceId,
        p_operation_id: claim.operationId,
        p_attempt: claim.attemptCount,
        p_input_fingerprint: claim.inputFingerprint,
        p_result: result,
        p_metadata: metadata,
      })
      .abortSignal(AbortSignal.timeout(10000));
    if (!error) return;
    if (error.code === "40001" || error.code === "P0002")
      throw new OperationError(
        "INPUT_SUPERSEDED",
        "The task inputs changed.",
        409,
      );
    if (["22023", "23514"].includes(error.code))
      throw new OperationError("CHECKPOINT_INVALID", "The task result did not meet the storage contract.", 502, false);
    if (attempt === 1)
      throw new OperationError(
        "CHECKPOINT_UNAVAILABLE",
        "The task result could not be preserved.",
        503,
        true,
      );
  }
}
