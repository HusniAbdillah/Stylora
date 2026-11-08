import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  authorizeWorkflowWorker,
  executorResponse,
  usesWorkflowWorker,
  usesBackgroundExecution,
  workflowExecutionMode,
} from "./execution-mode";

afterEach(() => vi.unstubAllEnvs());
describe("dedicated workflow executor", () => {
  it("keeps inline execution as the compatibility default", () => {
    vi.stubEnv("STYLORA_EXECUTION_MODE", undefined);
    expect(usesWorkflowWorker()).toBe(false);
    expect(workflowExecutionMode()).toBe("inline");
    expect(usesBackgroundExecution()).toBe(false);
  });
  it("selects queue execution without requiring the legacy worker secret", () => {
    vi.stubEnv("STYLORA_EXECUTION_MODE", "queue");
    vi.stubEnv("STYLORA_WORKER_SECRET", "");
    expect(workflowExecutionMode()).toBe("queue");
    expect(usesWorkflowWorker()).toBe(false);
    expect(usesBackgroundExecution()).toBe(true);
    expect(authorizeWorkflowWorker(new Request("http://localhost"))).toBe(
      false,
    );
  });
  it.each(["", "unknown", "QUEUE"])(
    "rejects unsupported execution mode %s",
    (mode) => {
      vi.stubEnv("STYLORA_EXECUTION_MODE", mode);
      expect(() => workflowExecutionMode()).toThrow(
        expect.objectContaining({ code: "EXECUTOR_CONFIGURATION_INVALID" }),
      );
    },
  );
  it("fails closed when the worker secret is missing", () => {
    vi.stubEnv("STYLORA_EXECUTION_MODE", "worker");
    vi.stubEnv("STYLORA_WORKER_SECRET", "");
    expect(() => usesWorkflowWorker()).toThrow();
    expect(authorizeWorkflowWorker(new Request("http://localhost"))).toBe(
      false,
    );
  });
  it("accepts only the exact dedicated bearer secret", () => {
    vi.stubEnv("STYLORA_WORKER_SECRET", "a".repeat(43));
    const request = (value: string) =>
      new Request("http://localhost", { headers: { authorization: value } });
    expect(authorizeWorkflowWorker(request("Bearer " + "a".repeat(43)))).toBe(
      true,
    );
    expect(authorizeWorkflowWorker(request("Bearer " + "b".repeat(43)))).toBe(
      false,
    );
    expect(authorizeWorkflowWorker(request("Bearer " + "é".repeat(43)))).toBe(
      false,
    );
    expect(authorizeWorkflowWorker(request("a".repeat(43)))).toBe(false);
  });
  it.each(["worker", "queue"])(
    "marks %s acknowledgments for polling while preserving error status",
    async (mode) => {
      vi.stubEnv("STYLORA_EXECUTION_MODE", mode);
      vi.stubEnv("STYLORA_WORKER_SECRET", "a".repeat(43));
      const response = executorResponse(
        Response.json({ data: { status: "queued" } }),
      );
      expect(response.status).toBe(202);
      expect(response.headers.get("x-stylora-executor")).toBe(mode);
      expect(await response.json()).toEqual({ data: { status: "queued" } });
      const failure = executorResponse(Response.json({}, { status: 409 }));
      expect(failure.status).toBe(409);
      expect(failure.headers.has("x-stylora-executor")).toBe(false);
    },
  );
});
