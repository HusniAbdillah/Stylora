import { describe, expect, it } from "vitest";
import {
  createFailureState,
  isRetryableCreateFailureCode,
} from "./create-failure";

const context = {
  checkpointed: false,
  committing: false,
  now: Date.UTC(2026, 10, 8),
};
describe("Create persisted failure contract", () => {
  it.each([
    ["provider_timeout", null, "PROVIDER_TIMEOUT"],
    ["provider_network_error", null, "PROVIDER_NETWORK_ERROR"],
    ["provider_unavailable", 429, "PROVIDER_RATE_LIMITED"],
    ["provider_unavailable", 503, "PROVIDER_SERVER_ERROR"],
    ["provider_unavailable", null, "PROVIDER_NETWORK_ERROR"],
    ["provider_capacity_busy", null, "PROVIDER_CAPACITY_BUSY"],
    ["operation_persistence_failed", null, "WORKFLOW_COMMIT_UNAVAILABLE"],
    ["operation_checkpoint_unavailable", null, "CHECKPOINT_UNAVAILABLE"],
  ])("persists %s (HTTP %s) as %s", (source, httpStatus, code) => {
    const failure = createFailureState(
      { code: source, retryable: true, status: 503 },
      { ...context, provider: { httpStatus, retryAfterMs: 60000 } },
    );
    expect(failure).toMatchObject({
      code,
      retryable: true,
      retryAfter: new Date(context.now + 60000).toISOString(),
    });
    expect(isRetryableCreateFailureCode(failure.code)).toBe(true);
  });
  it("uses the commit-only recovery code only after a checkpoint and a transient commit failure", () => {
    const error = {
      code: "operation_persistence_failed",
      retryable: true,
      status: 502,
    };
    expect(
      createFailureState(error, {
        ...context,
        checkpointed: true,
        committing: true,
      }),
    ).toMatchObject({ code: "CHECKPOINT_COMMIT_PENDING", retryable: true });
    expect(
      createFailureState(error, { ...context, checkpointed: true }),
    ).toMatchObject({ code: "WORKFLOW_COMMIT_UNAVAILABLE" });
    for (const code of [
      "provider_invalid_output",
      "provider_refused",
      "operation_checkpoint_invalid",
      "invalid_explanation_evidence",
      "operation_input_invalid",
      "revision_conflict",
    ]) {
      expect(
        createFailureState(
          { code, retryable: false, status: 502 },
          { ...context, checkpointed: true, committing: true },
        ),
      ).toMatchObject({ code: code.toUpperCase(), retryable: false });
    }
    expect(
      createFailureState(
        { code: "operation_failed", retryable: true, status: 502 },
        { ...context, checkpointed: true, committing: true },
      ).retryable,
    ).toBe(false);
  });
});
