import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queueClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@vercel/queue", () => ({ QueueClient: mocks.queueClient }));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  mocks.queueClient.mockImplementation(function QueueClient(options) {
    return { options };
  });
});

describe("workflow queue client", () => {
  it("uses the platform dispatcher and lets Vercel use OIDC", async () => {
    const { workflowQueueClient } = await import("./queue-client");

    workflowQueueClient();

    expect(mocks.queueClient).toHaveBeenCalledWith({
      region: "hnd1",
    });
  });
});
