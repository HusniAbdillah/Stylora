import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as textPost } from "@/app/api/queues/text/route";
import { POST as imagePost } from "@/app/api/queues/image/route";

const mocks = vi.hoisted(() => ({ configured: vi.fn(), consume: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./queue-config", () => ({ queueConfigured: mocks.configured }));
vi.mock("./queue-consume", () => ({
  consumeWorkflowMessage: mocks.consume,
  queueRetry: () => ({ afterSeconds: 30 }),
}));

const network = vi.fn();
function request(headers: Record<string, string> = {}, body = "{}") {
  return new Request("http://localhost/api/queues/text", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.configured.mockReturnValue(true);
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubGlobal(
    "fetch",
    network.mockRejectedValue(new Error("Network is disabled in this test")),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each([
  ["text", textPost],
  ["image", imagePost],
] as const)("%s queue callback boundary", (_lane, post) => {
  it("rejects missing queue configuration before invoking the SDK callback", async () => {
    mocks.configured.mockReturnValue(false);
    const response = await post(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "QUEUE_UNCONFIGURED" },
    });
    expect(console.error).not.toHaveBeenCalled();
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it.each(["production", "test"])(
    "rejects standalone %s even when explicit queue credentials are configured",
    async (environment) => {
      vi.stubEnv("VERCEL", undefined);
      vi.stubEnv("NODE_ENV", environment);
      const response = await post(request());
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: { code: "QUEUE_UNCONFIGURED" },
      });
      expect(console.error).not.toHaveBeenCalled();
      expect(mocks.consume).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();
    },
  );

  it("passes a configured platform request to the real SDK envelope parser", async () => {
    const response = await post(request());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("Invalid content type"),
    });
    expect(console.error).toHaveBeenCalledOnce();
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it("allows the configured development broker to reach the SDK parser", async () => {
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("NODE_ENV", "development");
    const response = await post(request());
    expect(response.status).toBe(400);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it("rejects incomplete binary CloudEvent headers without consuming or fetching", async () => {
    const response = await post(
      request({ "ce-type": "com.vercel.queue.v2beta" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("Missing required CloudEvent headers"),
    });
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it("rejects malformed structured envelopes before reaching application work", async () => {
    const response = await post(
      request(
        { "Content-Type": "application/cloudevents+json" },
        JSON.stringify({
          type: "com.vercel.queue.v1beta",
          source: "fixture-source",
          id: "fixture-event",
          data: {},
        }),
      ),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("Missing required CloudEvent data fields"),
    });
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });
});
