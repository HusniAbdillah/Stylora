export class OperationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 503,
    public readonly retryable = false,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "OperationError";
  }
}

export function canRetryOperationCode(code: string): boolean {
  return (
    [
      "PROVIDER_TIMEOUT",
      "PROVIDER_NETWORK_ERROR",
      "PROVIDER_RATE_LIMITED",
      "PROVIDER_SERVER_ERROR",
      "OPENAI_CONNECTION_FAILED",
      "CHECKPOINT_COMMIT_PENDING",
      "CHECKPOINT_UNAVAILABLE",
      "PROVIDER_DAILY_BUDGET_EXHAUSTED",
      "AVATAR_CONTEXT_PERSIST_FAILED",
      "AVATAR_CONTEXT_UNAVAILABLE",
      "AVATAR_SNAPSHOT_UNAVAILABLE",
      "CAPSULE_CONTEXT_UNAVAILABLE",
    ].includes(code) || /^OPENAI_HTTP_(429|500|502|503|504)$/.test(code)
  );
}
