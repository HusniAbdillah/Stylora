import { beforeEach, describe, expect, it, vi } from "vitest";
import { publishWorkflowDispatches } from "./queue-publish";

const mocks = vi.hoisted(() => ({
  database: vi.fn(),
  writes: vi.fn(),
  configured: vi.fn(),
  send: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  getWorkspaceDatabase: mocks.database,
  requireWorkspaceWrites: mocks.writes,
}));
vi.mock("./queue-config", () => ({ queueConfigured: mocks.configured }));
vi.mock("./queue-client", () => ({
  workflowQueueClient: () => ({ send: mocks.send }),
}));

const workspaceId = "cccf56bf-ac67-417e-bef1-f43dc6a87aa1";
const operationId = "208eddd1-b0af-4bf1-99f6-3d6e79f3000c";
const dispatchId = "c65c4e91-049a-4fae-879c-20c4512ba9d6";
const leaseToken = "681b61d2-680c-44eb-bd39-bb407775573a";
const dispatch = {
  id: dispatchId,
  operation_id: operationId,
  lease_token: leaseToken,
};
type DatabaseResult = { data: unknown; error: { code: string } | null };

function setup(kind = "capsule_generation") {
  const results = {
    claim: { data: [dispatch], error: null } as DatabaseResult,
    reconcile: { data: null, error: null } as DatabaseResult,
    kinds: { data: [{ id: operationId, kind }], error: null } as DatabaseResult,
    finish: [] as DatabaseResult[],
  };
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockImplementation(async () => results.kinds),
  };
  const rpc = vi.fn((name: string) => ({
    abortSignal: vi.fn().mockImplementation(async () => {
      if (name === "claim_workflow_dispatches") return results.claim;
      if (name === "reconcile_workflow_dispatches") return results.reconcile;
      if (name === "finish_workflow_dispatch")
        return results.finish.shift() ?? { data: null, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    }),
  }));
  const client = { rpc, from: vi.fn().mockReturnValue(query) };
  const context = { client, workspaceId, writesEnabled: true };
  mocks.database.mockReturnValue(context);
  mocks.configured.mockReturnValue(true);
  mocks.send.mockResolvedValue({ messageId: "fixture-message" });
  return { results, query, rpc, client, context };
}

beforeEach(() => vi.resetAllMocks());

describe("queue publisher", () => {
  it.each([
    ["capsule_generation", "text"],
    ["saved_avatar", "image"],
  ])(
    "sends %s as IDs only to the %s lane and acknowledges the fenced claim",
    async (kind, lane) => {
      const { rpc, query, client, context } = setup(kind);
      expect(await publishWorkflowDispatches()).toEqual({
        claimed: 1,
        published: 1,
        deferred: 0,
      });
      expect(mocks.writes).toHaveBeenCalledExactlyOnceWith(context);
      expect(rpc).toHaveBeenCalledWith("claim_workflow_dispatches", {
        p_workspace_id: workspaceId,
        p_limit: 3,
        p_lease_seconds: 60,
      });
      expect(client.from).toHaveBeenCalledExactlyOnceWith(
        "workflow_operations",
      );
      expect(query.eq).toHaveBeenCalledExactlyOnceWith(
        "workspace_id",
        workspaceId,
      );
      expect(query.in).toHaveBeenCalledExactlyOnceWith("id", [operationId]);
      expect(mocks.send).toHaveBeenCalledExactlyOnceWith(
        `stylora-${lane}`,
        {
          operationId,
          dispatchId,
        },
        { idempotencyKey: dispatchId, retentionSeconds: 604800 },
      );
      expect(rpc).toHaveBeenCalledWith("finish_workflow_dispatch", {
        p_workspace_id: workspaceId,
        p_outbox_id: dispatchId,
        p_lease_token: leaseToken,
        p_success: true,
        p_error_code: undefined,
      });
      expect(rpc.mock.calls.map(([name]) => name)).toEqual([
        "claim_workflow_dispatches",
        "finish_workflow_dispatch",
      ]);
    },
  );

  it("reuses the dispatch UUID after an ambiguous send instead of allocating new work", async () => {
    const { rpc } = setup();
    mocks.send.mockRejectedValueOnce(
      new Error("Transport disconnected after send"),
    );
    expect(await publishWorkflowDispatches()).toEqual({
      claimed: 1,
      published: 0,
      deferred: 1,
    });
    expect(rpc).toHaveBeenCalledWith(
      "finish_workflow_dispatch",
      expect.objectContaining({
        p_workspace_id: workspaceId,
        p_outbox_id: dispatchId,
        p_lease_token: leaseToken,
        p_success: false,
        p_error_code: "QUEUE_PUBLISH_UNAVAILABLE",
      }),
    );
    expect(await publishWorkflowDispatches()).toEqual({
      claimed: 1,
      published: 1,
      deferred: 0,
    });
    expect(mocks.send.mock.calls[0]).toEqual(mocks.send.mock.calls[1]);
    expect(
      rpc.mock.calls.every(([name]) =>
        ["claim_workflow_dispatches", "finish_workflow_dispatch"].includes(
          name,
        ),
      ),
    ).toBe(true);
  });

  it.each(["08006", "40001", "P0002"])(
    "reports a send with a lost or fenced acknowledgement as deferred: %s",
    async (code) => {
      const { results, rpc } = setup();
      results.finish.push({ data: null, error: { code } });
      expect(await publishWorkflowDispatches()).toEqual({
        claimed: 1,
        published: 0,
        deferred: 1,
      });
      expect(mocks.send).toHaveBeenCalledOnce();
      expect(rpc.mock.calls.map(([name]) => name)).toEqual([
        "claim_workflow_dispatches",
        "finish_workflow_dispatch",
      ]);
    },
  );

  it.each(["marketplace_search", "unknown_kind"])(
    "defers an unsupported operation kind without sending: %s",
    async (kind) => {
      const { rpc } = setup(kind);
      expect(await publishWorkflowDispatches()).toEqual({
        claimed: 1,
        published: 0,
        deferred: 1,
      });
      expect(mocks.send).not.toHaveBeenCalled();
      expect(rpc).toHaveBeenCalledWith(
        "finish_workflow_dispatch",
        expect.objectContaining({ p_success: false }),
      );
    },
  );

  it("does not send when the scoped operation query cannot find its parent", async () => {
    const { results } = setup();
    results.kinds.data = [];
    expect(await publishWorkflowDispatches()).toEqual({
      claimed: 1,
      published: 0,
      deferred: 1,
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("reconciles with a bounded workspace scope before claiming delivery", async () => {
    const { rpc, results, client } = setup();
    results.claim.data = [];
    expect(await publishWorkflowDispatches(2, true)).toEqual({
      claimed: 0,
      published: 0,
      deferred: 0,
    });
    expect(rpc.mock.calls).toEqual([
      [
        "reconcile_workflow_dispatches",
        { p_workspace_id: workspaceId, p_limit: 100 },
      ],
      [
        "claim_workflow_dispatches",
        { p_workspace_id: workspaceId, p_limit: 2, p_lease_seconds: 60 },
      ],
    ]);
    expect(client.from).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("fails closed before claiming when queue configuration is unavailable", async () => {
    setup();
    mocks.configured.mockReturnValue(false);
    await expect(publishWorkflowDispatches()).rejects.toMatchObject({
      code: "QUEUE_UNCONFIGURED",
      status: 503,
    });
    expect(mocks.database).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("keeps claim and operation-read failures recoverable without sending", async () => {
    const { results } = setup();
    results.claim.error = { code: "08006" };
    await expect(publishWorkflowDispatches()).rejects.toMatchObject({
      code: "DISPATCH_CLAIM_UNAVAILABLE",
      retryable: true,
    });
    results.claim.error = null;
    results.kinds.error = { code: "08006" };
    await expect(publishWorkflowDispatches()).rejects.toMatchObject({
      code: "DISPATCH_INPUT_UNAVAILABLE",
      retryable: true,
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
