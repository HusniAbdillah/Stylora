import { describe, expect, it } from "vitest";
import { operationIsDue, operationLane } from "./worker-policy";

describe("worker recovery policy", () => {
  const row = {
    status: "running",
    attempt_count: 1,
    lease_until: "2026-01-01T00:00:00Z",
    result_ref: null,
  };
  it("does not dispatch a live lease or a terminal failure", () => {
    expect(operationIsDue(row, 0)).toBe(false);
    expect(operationIsDue({ ...row, status: "failed" })).toBe(false);
  });
  it("recovers expired leases including exhausted attempts for terminal publication", () => {
    expect(operationIsDue(row)).toBe(true);
    expect(operationIsDue({ ...row, attempt_count: 3 })).toBe(true);
    expect(
      operationIsDue({ ...row, status: "queued", lease_until: null }),
    ).toBe(true);
  });
  it("keeps images in their separate bounded lane", () => {
    expect(operationLane("saved_avatar")).toBe("image");
    expect(operationLane("preview_image")).toBe("image");
    expect(operationLane("capsule_generation")).toBe("text");
  });
  it("respects persisted scheduling and only recovers explicitly retryable failures", () => {
    expect(
      operationIsDue(
        { ...row, status: "queued", next_attempt_at: "2026-01-01T00:00:10Z" },
        Date.parse("2026-01-01T00:00:09Z"),
      ),
    ).toBe(false);
    expect(
      operationIsDue(
        { ...row, status: "queued", next_attempt_at: "2026-01-01T00:00:10Z" },
        Date.parse("2026-01-01T00:00:10Z"),
      ),
    ).toBe(true);
    expect(
      operationIsDue({
        ...row,
        status: "failed",
        result_ref: { retryable: true },
      }),
    ).toBe(true);
    expect(
      operationIsDue({
        ...row,
        status: "failed",
        attempt_count: 3,
        result_ref: { retryable: true, checkpointed: true },
      }),
    ).toBe(false);
    expect(
      operationIsDue({
        ...row,
        status: "failed",
        result_ref: { retryable: "true" },
      }),
    ).toBe(false);
  });
});
