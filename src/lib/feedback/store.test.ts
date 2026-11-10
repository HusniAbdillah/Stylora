import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("window", {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("feedback toast policy", () => {
  it("keeps progress in activity and announces the final outcome", async () => {
    const { getFeedbackSnapshot, publishFeedback } = await import("./store");
    publishFeedback({
      id: "test-operation",
      label: "Outfit ideas",
      state: "running",
      detail: "In progress",
    });
    expect(getFeedbackSnapshot()[0]).toMatchObject({
      state: "running",
      toast: false,
    });

    publishFeedback({
      id: "test-operation",
      label: "Outfit ideas",
      state: "complete",
      detail: "Ready to view.",
    });
    expect(getFeedbackSnapshot()[0]).toMatchObject({
      state: "complete",
      toast: true,
    });
  });
});
