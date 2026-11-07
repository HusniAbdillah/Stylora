import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("window", {});
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("operation notification reconciliation", () => {
  it("keeps old completions quiet, preserves dismissals, and announces a real transition", async () => {
    const { acceptOperationActivity } = await import("./notifications");
    const { dismissFeedback, getFeedbackSnapshot } =
      await import("@/lib/feedback/store");
    const row = {
      id: "7835d538-e16b-46b1-a1ee-8f32e533d2ea",
      kind: "preview_image" as const,
      status: "succeeded" as const,
      subjectType: "draft",
      subjectId: "27cc150c-452f-4b2a-bce8-9c5c4c4ceacf",
      updatedAt: "2026-11-07T01:00:00Z",
    };
    acceptOperationActivity([row]);
    expect(getFeedbackSnapshot()[0].toast).toBe(false);
    acceptOperationActivity([
      { ...row, status: "running", updatedAt: "2026-11-07T01:01:00Z" },
    ]);
    expect(getFeedbackSnapshot()[0].toast).toBe(true);
    dismissFeedback(`operation:${row.id}`);
    acceptOperationActivity([
      { ...row, status: "running", updatedAt: "2026-11-07T01:02:00Z" },
    ]);
    expect(getFeedbackSnapshot()[0].toast).toBe(false);
    acceptOperationActivity([{ ...row, updatedAt: "2026-11-07T01:03:00Z" }]);
    expect(getFeedbackSnapshot()[0]).toMatchObject({
      state: "complete",
      toast: true,
    });
    expect(getFeedbackSnapshot()).toHaveLength(1);
  });
  it("rejects stale snapshots instead of replacing a newer completion", async () => {
    const { acceptOperationActivity } = await import("./notifications");
    const { getFeedbackSnapshot } = await import("@/lib/feedback/store");
    const row = {
      id: "a2b00585-b7da-4e20-9926-a1413bce2265",
      kind: "saved_avatar" as const,
      status: "succeeded" as const,
      subjectType: "saved_look",
      subjectId: "69df70f4-8d53-43ba-b0f9-939b0c2af769",
      updatedAt: "2026-11-07T02:00:00Z",
    };
    acceptOperationActivity([row]);
    acceptOperationActivity([
      { ...row, status: "running", updatedAt: "2026-11-07T01:00:00Z" },
    ]);
    expect(getFeedbackSnapshot()[0].state).toBe("complete");
    expect(getFeedbackSnapshot()[0].href).toBe(`/saved-looks/${row.subjectId}`);
  });
});
