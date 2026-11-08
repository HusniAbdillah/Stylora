import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const executor = vi.hoisted(() => ({ authorize: vi.fn(), run: vi.fn() }));
vi.mock("./execution-mode", () => ({
  authorizeWorkflowWorker: executor.authorize,
  usesWorkflowWorker: () => true,
  workflowExecutionMode: () => "worker",
}));
vi.mock("./worker", () => ({ executeQueuedOperation: executor.run }));
import { GET, POST } from "@/app/api/internal/workflow-worker/route";

beforeEach(() => {
  vi.clearAllMocks();
  executor.authorize.mockReturnValue(true);
});
const id = "708352c5-2c5e-45a5-84d8-41e06eb38428";
const request = (body: unknown) =>
  new Request("http://localhost/api/internal/workflow-worker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
describe("worker HTTP boundary", () => {
  it("denies both methods before execution without the dedicated secret", async () => {
    executor.authorize.mockReturnValue(false);
    expect((await POST(request({ operationId: id }))).status).toBe(401);
    expect((await GET(new Request("http://localhost"))).status).toBe(401);
    expect(executor.run).not.toHaveBeenCalled();
  });
  it("rejects invalid IDs and client-supplied workspace scope with 400", async () => {
    expect((await POST(request({ operationId: "invalid" }))).status).toBe(400);
    expect(
      (await POST(request({ operationId: id, workspaceId: id }))).status,
    ).toBe(400);
    expect(executor.run).not.toHaveBeenCalled();
  });
  it("bounds the request body before dispatch", async () => {
    expect((await POST(request({ padding: "x".repeat(65_537) }))).status).toBe(
      413,
    );
    expect(executor.run).not.toHaveBeenCalled();
  });
  it("dispatches only the validated operation ID", async () => {
    executor.run.mockResolvedValue({ id, status: "succeeded" });
    const response = await POST(request({ operationId: id }));
    expect(await response.json()).toEqual({
      data: { id, status: "succeeded" },
    });
    expect(executor.run).toHaveBeenCalledExactlyOnceWith(id);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
