import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { OperationError } from "./errors";
import type { Operation } from "./schema";
import { executeQueuedOperation } from "./worker";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  capsule: vi.fn(),
  preview: vi.fn(),
  avatar: vi.fn(),
  wardrobe: vi.fn(),
  read: vi.fn(),
  run: vi.fn(),
  database: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./create", () => ({ executeOperation: mocks.create }));
vi.mock("@/features/capsules/generate", () => ({
  runCapsuleOperation: mocks.capsule,
}));
vi.mock("@/features/preview/generation", () => ({
  runPreviewOperation: mocks.preview,
}));
vi.mock("@/features/outfits/saved-avatar", () => ({
  runSavedAvatar: mocks.avatar,
}));
vi.mock("@/features/wardrobe/analysis", () => ({
  executeWardrobeAnalysis: mocks.wardrobe,
}));
vi.mock("./server", () => ({
  readOperation: mocks.read,
  runOperation: mocks.run,
  operationStatus: (operation: Operation) => ({
    id: operation.id,
    status: operation.status,
  }),
}));
vi.mock("@/lib/supabase/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/server")>()),
  getWorkspaceDatabase: mocks.database,
}));

const workspaceId = "cccf56bf-ac67-417e-bef1-f43dc6a87aa1";
const operationId = "208eddd1-b0af-4bf1-99f6-3d6e79f3000c";
const subjectId = "5b611486-d163-4891-af5a-cc49469b2331";
const executors = [
  mocks.create,
  mocks.capsule,
  mocks.preview,
  mocks.avatar,
  mocks.wardrobe,
];

function operation(overrides: Partial<Operation> = {}): Operation {
  return {
    id: operationId,
    workspace_id: workspaceId,
    kind: "preview_image",
    subject_type: "draft",
    subject_id: subjectId,
    status: "queued",
    input_revision: 3,
    input_fingerprint: "a".repeat(64),
    input: {},
    attempt_count: 0,
    lease_until: null,
    result_ref: null,
    safe_error_code: null,
    cancel_requested_at: null,
    created_at: "2026-11-08T00:00:00Z",
    updated_at: "2026-11-08T00:00:00Z",
    ...overrides,
  };
}

function setup(current = operation()) {
  const query = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    throwOnError: vi.fn().mockResolvedValue({ error: null }),
  };
  const client = { from: vi.fn().mockReturnValue(query) };
  mocks.database.mockReturnValue({ client, workspaceId, writesEnabled: true });
  mocks.read.mockResolvedValue(current);
  const complete = operation({ status: "succeeded" });
  mocks.create.mockResolvedValue({ id: operationId, status: "succeeded" });
  for (const execute of [mocks.capsule, mocks.preview, mocks.avatar])
    execute.mockResolvedValue(complete);
  mocks.wardrobe.mockResolvedValue({
    operation: { id: operationId, status: "succeeded" },
  });
  return { query, client };
}

beforeEach(() => vi.resetAllMocks());

describe("workflow worker dispatch", () => {
  it("persists a retry schedule without dispatching work before its due time", async () => {
    const failed = operation({
      status: "failed",
      attempt_count: 1,
      safe_error_code: "PROVIDER_RATE_LIMITED",
      result_ref: { retryable: true },
    });
    const { client } = setup(failed);
    const deferred = {
      ...failed,
      status: "queued",
      next_attempt_at: new Date(Date.now() + 60000).toISOString(),
    };
    const rpc = vi.fn().mockResolvedValue({ data: deferred, error: null });
    Object.assign(client, { rpc });
    expect(await executeQueuedOperation(operationId)).toEqual({
      id: operationId,
      status: "queued",
    });
    expect(rpc).toHaveBeenCalledWith(
      "defer_workflow_operation",
      expect.objectContaining({
        p_workspace_id: workspaceId,
        p_operation_id: operationId,
        p_attempt_count: 1,
        p_safe_error_code: "PROVIDER_RATE_LIMITED",
      }),
    );
    for (const execute of executors) expect(execute).not.toHaveBeenCalled();
  });
  it.each(["running", "partial"] as const)(
    "keeps a live %s lease without invoking an executor or mutation",
    async (status) => {
      const { client } = setup(
        operation({
          status,
          lease_until: new Date(Date.now() + 60_000).toISOString(),
        }),
      );
      expect(await executeQueuedOperation(operationId)).toEqual({
        id: operationId,
        status,
      });
      for (const execute of executors) expect(execute).not.toHaveBeenCalled();
      expect(mocks.run).not.toHaveBeenCalled();
      expect(client.from).not.toHaveBeenCalled();
    },
  );

  it("never mutates or dispatches an operation rejected by the workspace read", async () => {
    const { client } = setup();
    mocks.read.mockRejectedValue(
      new OperationError("OPERATION_NOT_FOUND", "Unavailable", 404),
    );
    await expect(executeQueuedOperation(operationId)).rejects.toMatchObject({
      code: "OPERATION_NOT_FOUND",
      status: 404,
    });
    for (const execute of executors) expect(execute).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });

  it.each([
    ["inspiration_description", mocks.create],
    ["inspiration_confidence", mocks.create],
    ["wardrobe_match", mocks.create],
    ["outfit_options", mocks.create],
    ["option_regeneration", mocks.create],
    ["capsule_generation", mocks.capsule],
    ["preview_image", mocks.preview],
    ["saved_avatar", mocks.avatar],
    ["wardrobe_description", mocks.wardrobe],
  ] as const)(
    "dispatches queued %s to exactly its executor and persisted ID",
    async (kind, selected) => {
      setup(operation({ kind }));
      expect(await executeQueuedOperation(operationId)).toEqual({
        id: operationId,
        status: "succeeded",
      });
      expect(selected).toHaveBeenCalledExactlyOnceWith(operationId);
      for (const execute of executors.filter(
        (candidate) => candidate !== selected,
      ))
        expect(execute).not.toHaveBeenCalled();
      expect(mocks.run).not.toHaveBeenCalled();
    },
  );

  it("publishes a missing saved snapshot as a fenced terminal failure", async () => {
    const { client } = setup(
      operation({ kind: "saved_avatar", subject_type: "saved_look" }),
    );
    mocks.avatar.mockRejectedValue(
      new OperationError("SAVED_LOOK_NOT_FOUND", "Unavailable", 404),
    );
    mocks.run.mockImplementation(async (id, handler) => {
      expect(id).toBe(operationId);
      await expect(handler.execute()).rejects.toMatchObject({
        code: "SAVED_LOOK_NOT_FOUND",
        retryable: false,
      });
      return operation({ status: "failed" });
    });
    expect(await executeQueuedOperation(operationId)).toEqual({
      id: operationId,
      status: "failed",
    });
    expect(mocks.run).toHaveBeenCalledOnce();
    expect(client.from).not.toHaveBeenCalled();
  });

  it.each(["queued", "running", "partial"] as const)(
    "retires an older runtime only with a queued or expired %s predicate",
    async (status) => {
      const current = operation({
        kind: "inspiration_description",
        status,
        lease_until:
          status === "queued"
            ? null
            : new Date(Date.now() - 1000).toISOString(),
      });
      const { query } = setup(current);
      mocks.create.mockRejectedValue(
        new ApiError("operation_runtime_changed", "Old runtime", 409),
      );
      mocks.read
        .mockResolvedValueOnce(current)
        .mockResolvedValueOnce(operation({ status: "superseded" }));
      expect(await executeQueuedOperation(operationId)).toEqual({
        id: operationId,
        status: "superseded",
      });
      expect(query.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "superseded", lease_until: null }),
      );
      expect(query.eq).toHaveBeenCalledWith("workspace_id", workspaceId);
      expect(query.eq).toHaveBeenCalledWith(
        "input_fingerprint",
        current.input_fingerprint,
      );
      expect(query.eq).toHaveBeenCalledWith("updated_at", current.updated_at);
      expect(query.or).toHaveBeenCalledWith(
        expect.stringMatching(/^status\.eq\.queued,lease_until\.lte\./),
      );
      expect(query.throwOnError).toHaveBeenCalledOnce();
      expect(mocks.run).not.toHaveBeenCalled();
    },
  );
});
