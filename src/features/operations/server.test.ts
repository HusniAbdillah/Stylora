import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const database = vi.hoisted(() => ({ get: vi.fn(), writes: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  getWorkspaceDatabase: database.get,
  requireWorkspaceWrites: database.writes,
}));

import { failOperation, runOperation } from "./server";

const operationId = "d270f645-b0d9-4c6f-8593-a154f31b98c9";
const workspaceId = "ae781e34-b315-44a5-abfe-0c6c074a49c8";
const operation = {
  id: operationId,
  workspace_id: workspaceId,
  kind: "preview_image",
  subject_type: "draft",
  subject_id: operationId,
  status: "running",
  input_revision: 1,
  input_fingerprint: "a".repeat(64),
  input: {},
  attempt_count: 1,
  lease_until: "2026-11-08T03:00:00+00:00",
  result_ref: null,
  safe_error_code: null,
  cancel_requested_at: null,
  created_at: "2026-11-07T03:00:00+00:00",
  updated_at: "2026-11-07T03:00:00+00:00",
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

function setupRead() {
  const read = vi.fn().mockResolvedValue({ data: operation, error: null });
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: read };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const rpc = vi.fn();
  database.get.mockReturnValue({
    workspaceId,
    writesEnabled: true,
    client: { from: () => query, rpc },
  });
  return { read, rpc, query };
}

describe("operation execution claims", () => {
  it("finishes failures atomically with the attempt fence and safe retry metadata", async () => {
    const { rpc } = setupRead();
    rpc.mockResolvedValue({
      data: { ...operation, status: "failed", lease_until: null },
      error: null,
    });
    await failOperation(
      {
        operationId,
        inputRevision: 1,
        inputFingerprint: "a".repeat(64),
        attemptCount: 1,
        input: {},
        signal: AbortSignal.abort(),
      },
      { code: "PROVIDER_TIMEOUT", retryable: true, retryAfterSeconds: 10 },
    );
    expect(rpc).toHaveBeenCalledWith(
      "finish_workflow_operation",
      expect.objectContaining({
        p_workspace_id: workspaceId,
        p_operation_id: operationId,
        p_attempt_count: 1,
        p_status: "failed",
        p_safe_error_code: "PROVIDER_TIMEOUT",
        p_result_ref: expect.objectContaining({ retryable: true }),
      }),
    );
  });

  it("returns an already-claimed operation without a second provider execution", async () => {
    const { rpc, query } = setupRead();
    rpc.mockResolvedValue({ data: null, error: { code: "55P03" } });
    const handler = { execute: vi.fn(), commit: vi.fn() };
    const result = await runOperation(operationId, handler);
    expect(result.status).toBe("running");
    expect(handler.execute).not.toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith("workspace_id", workspaceId);
  });

  it("passes completed output to the fenced commit even when the provider signal expired", async () => {
    const { read, rpc } = setupRead();
    read.mockResolvedValueOnce({
      data: { ...operation, status: "queued" },
      error: null,
    });
    read.mockResolvedValue({
      data: { ...operation, status: "succeeded", lease_until: null },
      error: null,
    });
    rpc.mockResolvedValue({ data: operation, error: null });
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
    const output = { assetId: workspaceId };
    const handler = {
      execute: vi.fn().mockResolvedValue(output),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    const result = await runOperation(operationId, handler);
    expect(result.status).toBe("succeeded");
    expect(handler.commit).toHaveBeenCalledWith(
      expect.objectContaining({ attemptCount: 1 }),
      output,
    );
  });
});
