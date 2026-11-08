import "server-only";
import { z } from "zod";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
} from "@/lib/supabase/server";
import { canRetryOperationCode, OperationError } from "./errors";
import { workflowProviderLimits } from "./limits";
import { assertWorkflowExecutorAvailable } from "./health";
import { checkpointOperationResult, readOperationCheckpoint, type OperationCheckpoint, type CheckpointJson } from "./checkpoints";
import {
  operationRowSchema,
  startOperationSchema,
  type Operation,
  type StartOperationInput,
} from "./schema";

export { OperationError } from "./errors";
export { fingerprintOperationInput } from "./fingerprint";
export { assertWorkflowRpc } from "./readiness";
export {
  operationStatus,
  type Operation,
  type OperationStatus,
} from "./schema";

function databaseError(code: string | undefined): never {
  if (code === "P0002")
    throw new OperationError(
      "OPERATION_NOT_FOUND",
      "This operation is unavailable.",
      404,
    );
  if (code === "40001")
    throw new OperationError(
      "OPERATION_REVISION_CONFLICT",
      "The inputs changed. Reload the current result.",
      409,
    );
  if (code === "55P03")
    throw new OperationError(
      "OPERATION_ALREADY_RUNNING",
      "This operation is already running.",
      409,
    );
  throw new OperationError(
    "OPERATION_UNAVAILABLE",
    "The operation could not be updated. Try again.",
    503,
    true,
  );
}

export async function readOperation(operationId: string): Promise<Operation> {
  if (!z.uuid().safeParse(operationId).success)
    throw new OperationError(
      "INVALID_OPERATION_ID",
      "Choose a valid operation.",
      400,
    );
  const context = getWorkspaceDatabase();
  const { data, error } = await context.client
    .from("workflow_operations")
    .select("*")
    .eq("workspace_id", context.workspaceId)
    .eq("id", operationId)
    .maybeSingle();
  if (error) databaseError(error.code);
  if (!data) databaseError("P0002");
  return operationRowSchema.parse(data);
}

export async function startOperation(
  input: StartOperationInput,
): Promise<Operation> {
  const parsed = startOperationSchema.safeParse(input);
  if (!parsed.success)
    throw new OperationError(
      "INVALID_OPERATION_INPUT",
      "Check the operation inputs.",
      400,
    );
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const request = parsed.data;
  await assertWorkflowExecutorAvailable();
  const { data, error } = await context.client.rpc("start_workflow_operation", {
    p_workspace_id: context.workspaceId,
    p_kind: request.kind,
    p_subject_type: request.subjectType,
    p_subject_id: request.subjectId,
    p_input_revision: request.inputRevision,
    p_input_fingerprint: request.inputFingerprint,
    p_input: request.input,
    p_prompt_version: request.promptVersion,
    p_schema_version: request.schemaVersion,
    p_model: request.model,
  });
  if (error) databaseError(error.code);
  return operationRowSchema.parse(data);
}

export type OperationClaim = {
  operationId: string;
  inputRevision: number;
  inputFingerprint: string;
  attemptCount: number;
  input: Operation["input"];
  signal: AbortSignal;
};

export type OperationHandler<T> = {
  execute(claim: OperationClaim): Promise<T>;
  commit(claim: OperationClaim, output: T): Promise<void>;
  checkpoint?: {
    serialize(output: T): OperationCheckpoint;
    restore(claim: OperationClaim, result: CheckpointJson, metadata: CheckpointJson): Promise<T>;
  };
  fail?(claim: OperationClaim, error: OperationFailure): Promise<void>;
};

type OperationFailure = {
  code: string;
  retryable: boolean;
  retryAfterSeconds?: number;
  diagnostics?: { code: string; path: string }[];
  checkpointed?: boolean;
};

export async function failOperation(
  claim: OperationClaim,
  failure: OperationFailure,
): Promise<void> {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const code = z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{1,119}$/)
    .parse(failure.code);
  const retrySeconds = z
    .number()
    .int()
    .min(0)
    .max(86400)
    .optional()
    .parse(failure.retryAfterSeconds);
  const { data, error } = await context.client.rpc(
    "finish_workflow_operation",
    {
      p_workspace_id: context.workspaceId,
      p_operation_id: claim.operationId,
      p_attempt_count: claim.attemptCount,
      p_input_fingerprint: claim.inputFingerprint,
      p_status: ["INPUT_SUPERSEDED", "CAPSULE_SUPERSEDED"].includes(code)
        ? "superseded"
        : "failed",
      p_safe_error_code: code,
      p_result_ref: {
        ...(failure.checkpointed ? { checkpointed: true } : {}),
        retryable: failure.retryable && canRetryOperationCode(code),
        ...(retrySeconds === undefined
          ? {}
          : {
              retryAfter: new Date(
                Date.now() + retrySeconds * 1000,
              ).toISOString(),
            }),
      },
    },
  );
  if (error?.code === "40001") return;
  if (error) databaseError(error.code);
  const finished = operationRowSchema.parse(data);
  if (finished.status === "failed" && failure.diagnostics?.length) {
    const diagnostics = z
      .array(
        z.strictObject({
          code: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,79}$/),
          path: z.string().regex(/^[A-Za-z0-9_.\[\]]{0,160}$/),
        }),
      )
      .max(10)
      .parse(failure.diagnostics);
    // The finish RPC deliberately strips optional failure metadata. Attach only
    // sanitized field paths while retaining its attempt and revision fences.
    const { error: diagnosticError } = await context.client
      .from("workflow_operations")
      .update({ result_ref: { ...finished.result_ref, diagnostics } })
      .eq("workspace_id", context.workspaceId)
      .eq("id", claim.operationId)
      .eq("attempt_count", claim.attemptCount)
      .eq("input_fingerprint", claim.inputFingerprint)
      .eq("status", "failed")
      .eq("updated_at", finished.updated_at);
    if (diagnosticError) databaseError(diagnosticError.code);
  }
}

export async function runOperation<T>(
  operationId: string,
  handler: OperationHandler<T>,
): Promise<Operation> {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const existing = await readOperation(operationId);
  if (
    ["succeeded", "cancelled", "superseded", "failed"].includes(existing.status)
  )
    return existing;
  const { data, error } = await context.client.rpc("claim_workflow_operation", {
    p_workspace_id: context.workspaceId,
    p_operation_id: existing.id,
    p_input_revision: existing.input_revision,
    p_lease_seconds: 280,
    p_text_daily_limit: workflowProviderLimits().textDailyLimit,
    p_image_daily_limit: workflowProviderLimits().imageDailyLimit,
  });
  if (error?.code === "55P03") return readOperation(existing.id);
  if (error) databaseError(error.code);
  const operation = operationRowSchema.parse(data);
  if (operation.status !== "running") return operation;
  const claim: OperationClaim = {
    operationId: operation.id,
    inputRevision: operation.input_revision,
    inputFingerprint: operation.input_fingerprint,
    attemptCount: operation.attempt_count,
    input: operation.input,
    signal: AbortSignal.timeout(
      Math.max(
        1,
        Math.min(
          240_000,
          operation.lease_until
            ? Date.parse(operation.lease_until) - Date.now() - 40_000
            : 240_000,
        ),
      ),
    ),
  };
  let checkpointed = false;
  try {
    const stored = handler.checkpoint ? await readOperationCheckpoint(claim) : null;
    const output = stored && handler.checkpoint
      ? await handler.checkpoint.restore(claim, stored.result, stored.metadata)
      : await handler.execute(claim);
    if (handler.checkpoint && !stored)
      await checkpointOperationResult(claim, handler.checkpoint.serialize(output));
    checkpointed = !!handler.checkpoint;
    await handler.commit(claim, output);
    const committed = await readOperation(operation.id);
    if (!["succeeded", "cancelled", "superseded"].includes(committed.status)) {
      throw new OperationError(
        "OPERATION_COMMIT_INCOMPLETE",
        "The result could not be committed.",
      );
    }
  } catch (failure) {
    const providerFailure = z
      .object({
        code: z.string().regex(/^(OPENAI|CAPSULE)_[A-Z0-9_]{1,100}$/),
        retryable: z.boolean(),
        retryAfterSeconds: z.number().int().min(0).max(86400).optional(),
        diagnostics: z
          .array(
            z.strictObject({
              code: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,79}$/),
              path: z.string().regex(/^[A-Za-z0-9_.\[\]]{0,160}$/),
            }),
          )
          .max(10)
          .optional(),
      })
      .safeParse(failure);
    const safeError =
      failure instanceof OperationError
        ? failure
        : providerFailure.success
          ? new OperationError(
              providerFailure.data.code,
              "The AI provider could not finish. Check the task status.",
              503,
              providerFailure.data.retryable &&
                canRetryOperationCode(providerFailure.data.code),
              providerFailure.data.retryAfterSeconds,
            )
          : new OperationError(
              claim.signal.aborted
                ? "PROVIDER_TIMEOUT"
                : "OPERATION_EXECUTION_FAILED",
              "The operation could not finish. Try again.",
              503,
              claim.signal.aborted,
            );
    await (handler.fail ?? failOperation)(claim, {
      code: checkpointed && safeError.status >= 500 ? "CHECKPOINT_COMMIT_PENDING" : safeError.code,
      retryable: checkpointed && safeError.status >= 500 ? true : safeError.retryable,
      checkpointed,
      retryAfterSeconds: safeError.retryAfterSeconds,
      diagnostics: providerFailure.success
        ? providerFailure.data.diagnostics
        : undefined,
    });
  }
  return readOperation(operation.id);
}
