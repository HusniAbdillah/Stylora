import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("window", {});
});
afterEach(() => {
  vi.unstubAllGlobals();
});
describe("request feedback integrity", () => {
  it("reports a saved candidate with a failed image as needing attention", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ data: { importStatus: "image_pending" } }),
        ),
    );
    const { feedbackRequest } = await import("./request");
    const { getFeedbackSnapshot } = await import("./store");
    await feedbackRequest("/api/products/sample-product/wardrobe", {
      method: "POST",
    });
    expect(getFeedbackSnapshot()[0]).toMatchObject({
      state: "failed",
      detail:
        "Candidate saved, but its image could not be copied. Retry the image import.",
    });
  });
  it("does not claim success for a malformed successful HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ unexpected: true })),
    );
    const { feedbackRequest } = await import("./request");
    const { getFeedbackSnapshot } = await import("./store");
    await feedbackRequest("/api/looks/sample-look/save", { method: "POST" });
    expect(getFeedbackSnapshot()[0].state).toBe("failed");
  });
  it("keeps concurrent shopping requests separate", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () =>
          Response.json({ data: { status: "ready" } }),
        ),
    );
    const { feedbackRequest } = await import("./request");
    const { getFeedbackSnapshot } = await import("./store");
    await Promise.all([
      feedbackRequest("/api/looks/sample-look/products/search", {
        method: "POST",
      }),
      feedbackRequest("/api/looks/sample-look/products/search", {
        method: "POST",
      }),
    ]);
    expect(getFeedbackSnapshot()).toHaveLength(2);
    expect(new Set(getFeedbackSnapshot().map((item) => item.id)).size).toBe(2);
  });
});
