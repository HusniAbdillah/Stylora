import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperationError } from "./errors";
import { POST } from "@/app/api/internal/workflow-dispatch/route";

const mocks = vi.hoisted(() => ({ mode: vi.fn(), publish: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./execution-mode", () => ({ workflowExecutionMode: mocks.mode }));
vi.mock("./queue-publish", () => ({
  publishWorkflowDispatches: mocks.publish,
}));

const secret = "a".repeat(43);
function request(authorization?: string) {
  return new Request("http://localhost/api/internal/workflow-dispatch", {
    method: "POST",
    headers: authorization ? { Authorization: authorization } : {},
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STYLORA_DISPATCH_SECRET", secret);
  mocks.mode.mockReturnValue("queue");
  mocks.publish.mockResolvedValue({ claimed: 2, published: 1, deferred: 1 });
});
afterEach(() => vi.unstubAllEnvs());

describe("dispatch repair HTTP boundary", () => {
  it.each([
    undefined,
    `Bearer ${"b".repeat(43)}`,
    `Bearer ${"a".repeat(42)}`,
    `Basic ${secret}`,
    `Bearer ${secret}!`,
    `Bearer ${secret} extra`,
  ])(
    "rejects missing or incorrect authorization before checking mode: %s",
    async (authorization) => {
      const response = await POST(request(authorization));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: "DISPATCH_UNAUTHORIZED" },
      });
      expect(mocks.mode).not.toHaveBeenCalled();
      expect(mocks.publish).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, "", "a".repeat(42), "!".repeat(43), "a".repeat(129)])(
    "fails closed when the dedicated server secret is unconfigured or invalid: %s",
    async (configuredSecret) => {
      vi.stubEnv("STYLORA_DISPATCH_SECRET", configuredSecret);
      const response = await POST(request(`Bearer ${secret}`));
      expect(response.status).toBe(401);
      expect(mocks.mode).not.toHaveBeenCalled();
      expect(mocks.publish).not.toHaveBeenCalled();
    },
  );

  it("does not accept worker or provider credentials as the dedicated repair token", async () => {
    const otherSecret = "b".repeat(43);
    vi.stubEnv("STYLORA_WORKER_SECRET", otherSecret);
    vi.stubEnv("OPENAI_API_KEY", otherSecret);
    expect((await POST(request(`Bearer ${otherSecret}`))).status).toBe(401);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("reconciles and publishes at most three rows with the dedicated token in queue mode", async () => {
    const response = await POST(request(`Bearer ${secret}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { claimed: 2, published: 1, deferred: 1 },
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.publish).toHaveBeenCalledExactlyOnceWith(3, true);
  });

  it.each(["inline", "worker"])(
    "does not publish while the execution mode is %s",
    async (mode) => {
      mocks.mode.mockReturnValue(mode);
      const response = await POST(request(`Bearer ${secret}`));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: { executionMode: mode } });
      expect(mocks.publish).not.toHaveBeenCalled();
    },
  );

  it("preserves safe retry metadata when delivery recovery is unavailable", async () => {
    mocks.publish.mockRejectedValue(
      new OperationError(
        "DISPATCH_RECONCILE_UNAVAILABLE",
        "Delivery recovery is unavailable.",
        503,
        true,
        30,
      ),
    );
    const response = await POST(request(`Bearer ${secret}`));
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: {
        code: "DISPATCH_RECONCILE_UNAVAILABLE",
        message: "Delivery recovery is unavailable.",
        retryable: true,
      },
    });
  });

  it("returns a safe response when publishing throws an unexpected error", async () => {
    const privateDetail = "fixture transport detail that must stay server-side";
    mocks.publish.mockRejectedValue(new Error(`${privateDetail} ${secret}`));
    const response = await POST(request(`Bearer ${secret}`));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: "REQUEST_FAILED",
        message: "The request could not be completed. Try again.",
        retryable: true,
      },
    });
    expect(JSON.stringify(body)).not.toContain(privateDetail);
    expect(JSON.stringify(body)).not.toContain(secret);
  });

  it("handles invalid execution configuration without publishing", async () => {
    mocks.mode.mockImplementation(() => {
      throw new OperationError(
        "EXECUTOR_CONFIGURATION_INVALID",
        "Task execution is unavailable.",
        503,
      );
    });
    const response = await POST(request(`Bearer ${secret}`));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "EXECUTOR_CONFIGURATION_INVALID" },
    });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
