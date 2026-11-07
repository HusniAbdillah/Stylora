import "server-only";
import { z } from "zod";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
} from "@/lib/supabase/server";
import { canRetryOperationCode, OperationError } from "./errors";
import {
  operationRowSchema,
  startOperationSchema,
  type Operation,
  type StartOperationInput,
} from "./schema";

export { OperationError } from "./errors";
export { fingerprintOperationInput } from "./fingerprint";
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
  fail?(claim: OperationClaim, error: OperationFailure): Promise<void>;
};

type OperationFailure = {
  code: string;
  retryable: boolean;
  retryAfterSeconds?: number;
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
  const now = new Date().toISOString();
  const retrySeconds = z
    .number()
    .int()
    .min(0)
    .max(86400)
    .optional()
    .parse(failure.retryAfterSeconds);
  const { error } = await context.client
    .from("workflow_operations")
    .update({
      status: "failed",
      lease_until: null,
      completed_at: now,
      safe_error_code: code,
      result_ref: {
        retryable: failure.retryable && canRetryOperationCode(code),
        ...(retrySeconds === undefined
          ? {}
          : {
              retryAfter: new Date(
                Date.now() + retrySeconds * 1000,
              ).toISOString(),
            }),
      },
    })
    .eq("workspace_id", context.workspaceId)
    .eq("id", claim.operationId)
    .eq("attempt_count", claim.attemptCount)
    .eq("input_fingerprint", claim.inputFingerprint)
    .eq("input_revision", claim.inputRevision)
    .in("status", ["running", "partial"])
    .gt("lease_until", now);
  if (error) databaseError(error.code);
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
  });
  if (error) databaseError(error.code);
  const operation = operationRowSchema.parse(data);
  if (operation.status !== "running") return operation;
  const claim: OperationClaim = {
    operationId: operation.id,
    inputRevision: operation.input_revision,
    inputFingerprint: operation.input_fingerprint,
    attemptCount: operation.attempt_count,
    input: operation.input,
    signal: AbortSignal.timeout(240_000),
  };
  try {
    const output = await handler.execute(claim);
    claim.signal.throwIfAborted();
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
        code: z
          .string()
          .regex(
            /^OPENAI_(CONNECTION_FAILED|UNCONFIGURED|INVALID_OUTPUT|HTTP_\d{3}|IMAGE_[A-Z0-9_]{1,80})$/,
          ),
        retryable: z.boolean(),
        retryAfterSeconds: z.number().int().min(0).max(86400).optional(),
      })
      .safeParse(failure);
    const safeError =
      failure instanceof OperationError
        ? failure
        : providerFailure.success
          ? new OperationError(
              providerFailure.data.code,
              "The image provider could not finish. Try again.",
              503,
              providerFailure.data.retryable &&
                canRetryOperationCode(providerFailure.data.code),
              providerFailure.data.retryAfterSeconds,
            )
          : new OperationError(
              claim.signal.aborted
                ? "OPERATION_TIMEOUT"
                : "OPERATION_EXECUTION_FAILED",
              "The operation could not finish. Try again.",
              503,
              claim.signal.aborted,
            );
    await (handler.fail ?? failOperation)(claim, {
      code: safeError.code,
      retryable: safeError.retryable,
      retryAfterSeconds: safeError.retryAfterSeconds,
    });
  }
  return readOperation(operation.id);
}
