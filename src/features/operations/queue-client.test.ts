import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agent: vi.fn(),
  queueClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("undici", () => ({ Agent: mocks.agent }));
vi.mock("@vercel/queue", () => ({ QueueClient: mocks.queueClient }));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  mocks.agent.mockImplementation(function Agent(options) {
    return { options };
  });
  mocks.queueClient.mockImplementation(function QueueClient(options) {
    return { options };
  });
});

describe("workflow queue client", () => {
  it("uses native Agent timeouts without an interceptor and lets Vercel use OIDC", async () => {
    vi.stubEnv("STYLORA_QUEUE_TOKEN", "");
    const { workflowQueueClient } = await import("./queue-client");

    workflowQueueClient();

    expect(mocks.agent).toHaveBeenCalledWith({
      connect: { timeout: 5000 },
      headersTimeout: 15000,
      bodyTimeout: 15000,
    });
    expect(mocks.queueClient).toHaveBeenCalledWith({
      region: "hnd1",
      dispatcher: expect.any(Object),
    });
  });
});
