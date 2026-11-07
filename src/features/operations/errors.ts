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
      "OPERATION_TIMEOUT",
      "PROVIDER_UNAVAILABLE",
      "PROVIDER_TIMEOUT",
      "PROVIDER_RATE_LIMITED",
      "MODEL_UNAVAILABLE",
      "MODEL_TIMEOUT",
      "MODEL_RATE_LIMITED",
      "OPENAI_CONNECTION_FAILED",
    ].includes(code) || /^OPENAI_HTTP_(429|5\d{2})$/.test(code)
  );
}
