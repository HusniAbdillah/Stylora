import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ database: vi.fn(), mode: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  getWorkspaceDatabase: mocks.database,
}));
vi.mock("./execution-mode", () => ({ usesWorkflowWorker: mocks.mode }));
import { assertWorkflowExecutorAvailable } from "./health";
beforeEach(() => vi.resetAllMocks());
describe("consumer availability", () => {
  it("keeps inline execution independent of consumer health", async () => {
    mocks.mode.mockReturnValue(false);
    await assertWorkflowExecutorAvailable();
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it("rejects new background allocation while preserving the draft when no heartbeat is fresh", async () => {
    mocks.mode.mockReturnValue(true);
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      gt: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      abortSignal: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    for (const key of ["select", "eq", "gt", "order", "limit"] as const)
      query[key].mockReturnValue(query);
    mocks.database.mockReturnValue({
      workspaceId: "fixture-workspace",
      client: { from: () => query },
    });
    await expect(assertWorkflowExecutorAvailable()).rejects.toMatchObject({
      code: "EXECUTOR_OFFLINE",
      status: 503,
      retryAfterSeconds: 30,
    });
    expect(query.eq).toHaveBeenCalledWith("workspace_id", "fixture-workspace");
  });
});
