import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Operation } from "./schema";
import { consumeWorkflowMessage, QueueWait, queueRetry } from "./queue-consume";

const mocks = vi.hoisted(() => ({
  database: vi.fn(),
  writes: vi.fn(),
  execute: vi.fn(),
  read: vi.fn(),
  mode: vi.fn(),
  publish: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  getWorkspaceDatabase: mocks.database,
  requireWorkspaceWrites: mocks.writes,
}));
vi.mock("./worker", () => ({ executeQueuedOperation: mocks.execute }));
vi.mock("./server", () => ({ readOperation: mocks.read }));
vi.mock("./execution-mode", () => ({ workflowExecutionMode: mocks.mode }));
vi.mock("./queue-publish", () => ({
  publishWorkflowDispatches: mocks.publish,
}));

const workspaceId = "cccf56bf-ac67-417e-bef1-f43dc6a87aa1";
const operationId = "208eddd1-b0af-4bf1-99f6-3d6e79f3000c";
const dispatchId = "c65c4e91-049a-4fae-879c-20c4512ba9d6";
const foreignWorkspaceId = "f04e25dc-19aa-4967-ad88-6d2540d2f444";
const message = { operationId, dispatchId };
const now = Date.parse("2026-11-08T12:00:00Z");

function operation(overrides: Partial<Operation> = {}): Operation {
  return {
    id: operationId,
    workspace_id: workspaceId,
    kind: "capsule_generation",
    subject_type: "capsule",
    subject_id: "5b611486-d163-4891-af5a-cc49469b2331",
    status: "queued",
    input_revision: 3,
    input_fingerprint: "a".repeat(64),
    input: {},
    attempt_count: 0,
    lease_until: null,
    next_attempt_at: null,
    result_ref: null,
    safe_error_code: null,
    cancel_requested_at: null,
    created_at: "2026-11-08T00:00:00Z",
    updated_at: "2026-11-08T00:00:00Z",
    ...overrides,
  };
}

function setup(current = operation()) {
  const rows: Record<string, unknown>[] = [
    {
      id: dispatchId,
      workspace_id: workspaceId,
      operation_id: operationId,
      is_current: true,
    },
  ];
  const queries: {
    eq: ReturnType<typeof vi.fn>;
    abortSignal: ReturnType<typeof vi.fn>;
  }[] = [];
  const result = { error: null as { code: string } | null };
  const client = {
    from: vi.fn((table: string) => {
      expect(table).toBe("workflow_dispatch_outbox");
      const filters: [string, unknown][] = [];
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        abortSignal: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({
          data:
            rows.find((row) =>
              filters.every(([key, value]) => row[key] === value),
            ) ?? null,
          error: result.error,
        })),
      };
      query.eq.mockImplementation((key: string, value: unknown) => {
        filters.push([key, value]);
        return query;
      });
      queries.push(query);
      return query;
    }),
  };
  const context = { client, workspaceId, writesEnabled: true };
  mocks.database.mockReturnValue(context);
  mocks.mode.mockReturnValue("queue");
  mocks.read
    .mockResolvedValueOnce(current)
    .mockResolvedValue(operation({ status: "succeeded" }));
  mocks.execute.mockResolvedValue(undefined);
  mocks.publish.mockResolvedValue({ claimed: 1, published: 1, deferred: 0 });
  return { rows, queries, result, client, context };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(now);
});
afterEach(() => vi.restoreAllMocks());

describe("queue consumer", () => {
  it.each([
    null,
    {},
    { operationId, dispatchId: "bad" },
    { ...message, workspaceId },
  ])(
    "acknowledges malformed messages without querying or executing: %j",
    async (input) => {
      setup();
      await consumeWorkflowMessage(input, "text");
      expect(mocks.database).not.toHaveBeenCalled();
      expect(mocks.execute).not.toHaveBeenCalled();
    },
  );

  it("keeps a valid delivery retryable while queue execution is disabled", async () => {
    setup();
    mocks.mode.mockReturnValue("worker");
    await expect(consumeWorkflowMessage(message, "text")).rejects.toMatchObject(
      { afterSeconds: 60 },
    );
    expect(mocks.database).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each([
    ["foreign workspace", { workspace_id: foreignWorkspaceId }],
    ["stale outbox generation", { is_current: false }],
    [
      "different operation",
      { operation_id: "681b61d2-680c-44eb-bd39-bb407775573a" },
    ],
  ])("ignores a delivery for a %s", async (_name, overrides) => {
    const { rows, queries } = setup();
    Object.assign(rows[0], overrides);
    await consumeWorkflowMessage(message, "text");
    expect(queries[0].eq.mock.calls).toEqual([
      ["workspace_id", workspaceId],
      ["id", dispatchId],
      ["operation_id", operationId],
      ["is_current", true],
    ]);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each(["preview_image", "saved_avatar", "marketplace_search"] as const)(
    "does not execute %s from the text lane",
    async (kind) => {
      setup(operation({ kind }));
      await consumeWorkflowMessage(message, "text");
      expect(mocks.execute).not.toHaveBeenCalled();
      expect(mocks.publish).not.toHaveBeenCalled();
    },
  );

  it("does not execute text work from the image lane", async () => {
    setup();
    await consumeWorkflowMessage(message, "image");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each(["succeeded", "cancelled", "superseded"] as const)(
    "acknowledges an already %s operation without executing",
    async (status) => {
      setup(operation({ status }));
      await consumeWorkflowMessage(message, "text");
      expect(mocks.execute).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      attempt_count: 3,
      safe_error_code: "PROVIDER_TIMEOUT",
      result_ref: { retryable: true },
    },
    {
      attempt_count: 1,
      safe_error_code: "PROVIDER_INVALID_OUTPUT",
      result_ref: { retryable: true },
    },
    {
      attempt_count: 1,
      safe_error_code: "PROVIDER_TIMEOUT",
      result_ref: { retryable: false },
    },
  ])(
    "does not execute an exhausted or terminal failed operation: %j",
    async (fields) => {
      setup(operation({ status: "failed", ...fields }));
      await consumeWorkflowMessage(message, "text");
      expect(mocks.execute).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      status: "running" as const,
      lease_until: new Date(now + 60000).toISOString(),
    },
    {
      status: "partial" as const,
      lease_until: new Date(now + 60000).toISOString(),
    },
    { next_attempt_at: new Date(now + 60000).toISOString() },
  ])(
    "waits for a live lease or persisted retry schedule: %j",
    async (fields) => {
      setup(operation(fields));
      await expect(
        consumeWorkflowMessage(message, "text"),
      ).rejects.toMatchObject({ afterSeconds: 60 });
      expect(mocks.execute).not.toHaveBeenCalled();
      expect(mocks.publish).not.toHaveBeenCalled();
    },
  );

  it("executes due work once and acknowledges only its terminal persisted result", async () => {
    const { context } = setup();
    await consumeWorkflowMessage(message, "text");
    expect(mocks.writes).toHaveBeenCalledExactlyOnceWith(context);
    expect(mocks.execute).toHaveBeenCalledExactlyOnceWith(operationId);
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("retries an unchanged queued operation when the executor could not claim capacity", async () => {
    const { queries } = setup();
    mocks.read.mockReset().mockResolvedValue(operation());
    await expect(consumeWorkflowMessage(message, "text")).rejects.toMatchObject(
      { afterSeconds: 5 },
    );
    expect(mocks.execute).toHaveBeenCalledExactlyOnceWith(operationId);
    expect(queries).toHaveLength(2);
    for (const query of queries)
      expect(query.eq.mock.calls).toEqual([
        ["workspace_id", workspaceId],
        ["id", dispatchId],
        ["operation_id", operationId],
        ["is_current", true],
      ]);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("publishes the replacement generation after a fenced checkpoint retry transition", async () => {
    const { rows } = setup();
    mocks.read
      .mockReset()
      .mockResolvedValueOnce(
        operation({
          status: "failed",
          attempt_count: 1,
          safe_error_code: "CHECKPOINT_COMMIT_PENDING",
          result_ref: { retryable: true },
        }),
      )
      .mockResolvedValue(operation({ status: "queued", attempt_count: 1 }));
    mocks.execute.mockImplementation(async () => {
      rows[0].is_current = false;
    });
    await consumeWorkflowMessage(message, "text");
    expect(mocks.execute).toHaveBeenCalledExactlyOnceWith(operationId);
    expect(mocks.publish).toHaveBeenCalledExactlyOnceWith();
  });

  it("does not acknowledge unavailable outbox reads or executor failures", async () => {
    const { result } = setup();
    result.error = { code: "08006" };
    await expect(consumeWorkflowMessage(message, "text")).rejects.toMatchObject(
      { afterSeconds: 30 },
    );
    expect(mocks.execute).not.toHaveBeenCalled();
    result.error = null;
    mocks.execute.mockRejectedValue(new Error("Executor unavailable"));
    await expect(consumeWorkflowMessage(message, "text")).rejects.toThrow(
      "Executor unavailable",
    );
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});

describe("queue retry visibility", () => {
  it("bounds persisted waits to the SDK visibility range", () => {
    expect(queueRetry(new QueueWait(1), { deliveryCount: 1 })).toEqual({
      afterSeconds: 5,
    });
    expect(queueRetry(new QueueWait(600), { deliveryCount: 1 })).toEqual({
      afterSeconds: 600,
    });
    expect(queueRetry(new QueueWait(86400), { deliveryCount: 1 })).toEqual({
      afterSeconds: 3600,
    });
  });

  it("backs off transport failures without exceeding fifteen minutes", () => {
    expect(queueRetry(new Error("Transport"), { deliveryCount: 1 })).toEqual({
      afterSeconds: 10,
    });
    expect(queueRetry(new Error("Transport"), { deliveryCount: 30 })).toEqual({
      afterSeconds: 900,
    });
  });
});
