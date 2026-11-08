import { workflowDailyBudgetReset } from "./limits";
type Failure = { code: string; retryable: boolean; status: number };
type FailureContext = {
  checkpointed: boolean;
  committing: boolean;
  now?: number;
  provider?: { httpStatus: number | null; retryAfterMs: number | null } | null;
};

const retryableCodes = new Set([
  "PROVIDER_TIMEOUT",
  "PROVIDER_NETWORK_ERROR",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_SERVER_ERROR",
  "PROVIDER_CAPACITY_BUSY",
  "CHECKPOINT_UNAVAILABLE",
  "WORKFLOW_COMMIT_UNAVAILABLE",
  "PROVIDER_DAILY_BUDGET_EXHAUSTED",
]);

export function isRetryableCreateFailureCode(code: string | null | undefined) {
  return (
    typeof code === "string" &&
    (code === "CHECKPOINT_COMMIT_PENDING" || retryableCodes.has(code))
  );
}

export function createFailureState(failure: Failure, context: FailureContext) {
  let code = /^[a-zA-Z][a-zA-Z0-9_]{1,119}$/.test(failure.code)
    ? failure.code.toUpperCase()
    : "OPERATION_EXECUTION_FAILED";
  if (code === "PROVIDER_UNAVAILABLE" && failure.retryable)
    code =
      context.provider?.httpStatus === 429
        ? "PROVIDER_RATE_LIMITED"
        : context.provider?.httpStatus && context.provider.httpStatus >= 500
          ? "PROVIDER_SERVER_ERROR"
          : "PROVIDER_NETWORK_ERROR";
  if (code === "OPERATION_CHECKPOINT_UNAVAILABLE")
    code = "CHECKPOINT_UNAVAILABLE";
  if (code === "OPERATION_PERSISTENCE_FAILED")
    code = "WORKFLOW_COMMIT_UNAVAILABLE";
  const retryable = failure.retryable && retryableCodes.has(code);
  if (
    context.checkpointed &&
    context.committing &&
    retryable &&
    failure.status >= 500
  )
    code = "CHECKPOINT_COMMIT_PENDING";
  const delay =
    code === "PROVIDER_DAILY_BUDGET_EXHAUSTED"
      ? workflowDailyBudgetReset(context.now).retryAfterSeconds * 1000
      : context.provider?.retryAfterMs;
  const retryAt = new Date((context.now ?? Date.now()) + (delay ?? 0));
  return {
    code,
    retryable,
    status:
      code === "INPUT_SUPERSEDED"
        ? ("superseded" as const)
        : ("failed" as const),
    ...(retryable &&
    delay != null &&
    delay > 0 &&
    Number.isFinite(retryAt.valueOf())
      ? { retryAfter: retryAt.toISOString() }
      : {}),
  };
}
