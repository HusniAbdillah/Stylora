import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { authorizeWorkflowWorker, executorResponse, usesWorkflowWorker } from "./execution-mode";

afterEach(() => vi.unstubAllEnvs());
describe("dedicated workflow executor", () => {
  it("keeps inline execution as the compatibility default", () => {
    vi.stubEnv("STYLORA_EXECUTION_MODE", undefined);
    expect(usesWorkflowWorker()).toBe(false);
  });
  it("fails closed when the worker secret is missing", () => {
    vi.stubEnv("STYLORA_EXECUTION_MODE", "worker");
    vi.stubEnv("STYLORA_WORKER_SECRET", "");
    expect(() => usesWorkflowWorker()).toThrow();
    expect(authorizeWorkflowWorker(new Request("http://localhost"))).toBe(false);
  });
  it("accepts only the exact dedicated bearer secret", () => {
    vi.stubEnv("STYLORA_WORKER_SECRET", "a".repeat(43));
    const request = (value: string) => new Request("http://localhost", { headers: { authorization: value } });
    expect(authorizeWorkflowWorker(request("Bearer " + "a".repeat(43)))).toBe(true);
    expect(authorizeWorkflowWorker(request("Bearer " + "b".repeat(43)))).toBe(false);
    expect(authorizeWorkflowWorker(request("Bearer " + "é".repeat(43)))).toBe(false);
    expect(authorizeWorkflowWorker(request("a".repeat(43)))).toBe(false);
  });
  it("marks successful queue acknowledgments while preserving error status", () => {
    vi.stubEnv("STYLORA_EXECUTION_MODE", "worker");
    vi.stubEnv("STYLORA_WORKER_SECRET", "a".repeat(43));
    expect(executorResponse(Response.json({ data: {} })).status).toBe(202);
    expect(executorResponse(Response.json({}, { status: 409 })).status).toBe(409);
  });
});
