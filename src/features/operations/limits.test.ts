import { describe, expect, it } from "vitest";
import { workflowDailyBudgetReset, workflowProviderLimits } from "./limits";
import { createFailureState } from "./create-failure";

describe("daily provider budgets", () => {
  it("uses the next UTC date across month and year boundaries", () => {
    expect(
      workflowDailyBudgetReset(Date.parse("2026-12-31T23:59:58Z")),
    ).toEqual({ retryAfter: "2027-01-01T00:00:00.000Z", retryAfterSeconds: 2 });
    expect(
      workflowDailyBudgetReset(Date.parse("2028-02-29T00:00:00Z")),
    ).toEqual({
      retryAfter: "2028-03-01T00:00:00.000Z",
      retryAfterSeconds: 86400,
    });
  });
  it("preserves an explicit retry schedule for a budget race after claim", () => {
    expect(
      createFailureState(
        {
          code: "provider_daily_budget_exhausted",
          status: 429,
          retryable: true,
        },
        {
          checkpointed: false,
          committing: false,
          now: Date.parse("2026-11-08T23:59:00Z"),
        },
      ),
    ).toMatchObject({
      code: "PROVIDER_DAILY_BUDGET_EXHAUSTED",
      retryable: true,
      retryAfter: "2026-11-09T00:00:00.000Z",
    });
  });
  it("rejects malformed or unbounded deployment limits", () => {
    expect(() =>
      workflowProviderLimits({ STYLORA_TEXT_DAILY_LIMIT: "NaN" }),
    ).toThrow();
    expect(() =>
      workflowProviderLimits({ STYLORA_IMAGE_DAILY_LIMIT: "0" }),
    ).toThrow();
  });
});
