import { beforeEach, describe, expect, it, vi } from "vitest";
import { OperationError } from "@/features/operations/errors";
import { runSavedAvatar } from "./saved-avatar";

const mocks = vi.hoisted(() => ({
  database: vi.fn(),
  render: vi.fn(),
  discard: vi.fn(),
  settings: vi.fn(),
  promptVersion: "avatar-prompt.v1",
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/server")>()),
  getWorkspaceDatabase: mocks.database,
}));
vi.mock("@/features/operations/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/operations/server")>()),
  assertWorkflowRpc: vi.fn(),
}));
vi.mock("@/features/ai/openai", () => ({
  IMAGE_MODEL: "gpt-image-1.5",
  FASHION_SCHEMA_VERSION: "fashion-item.v1",
  FASHION_KNOWLEDGE_VERSION: "knowledge.v1",
  get AVATAR_PROMPT_VERSION() {
    return mocks.promptVersion;
  },
}));
vi.mock("@/features/preview/image", () => ({
  normalizeAvatarItems: (items: unknown[]) => items,
  renderAndStoreAvatar: mocks.render,
  discardPendingAvatar: mocks.discard,
  getAvatarRenderSettings: mocks.settings,
}));

const workspaceId = "cccf56bf-ac67-417e-bef1-f43dc6a87aa1";
const operationId = "208eddd1-b0af-4bf1-99f6-3d6e79f3000c";
const savedId = "5b611486-d163-4891-af5a-cc49469b2331";
const assetId = "873f4581-4ee6-4547-937f-53da95a60111";
const settings = {
  version: "avatar-render.v2",
  quality: "medium",
  size: "1024x1536",
  format: "png",
  inputFidelity: "high",
};

function setup() {
  const operation = {
    id: operationId,
    workspace_id: workspaceId,
    kind: "saved_avatar",
    subject_type: "saved_look",
    subject_id: savedId,
    status: "queued",
    input_revision: 1,
    input_fingerprint: "a".repeat(64),
    input: { saved_look_id: savedId, preference_snapshot_hash: "b".repeat(64) },
    attempt_count: 0,
    lease_until: null as string | null,
    result_ref: null as Record<string, unknown> | null,
    safe_error_code: null as string | null,
    cancel_requested_at: null,
    created_at: "2026-11-08T00:00:00Z",
    updated_at: "2026-11-08T00:00:00Z",
    completed_at: null as string | null,
  };
  const state = {
    operation,
    events: [] as { payload: Record<string, unknown> }[],
    constraintRejections: 0,
    eventFailure: false,
  };
  const snapshot = {
    id: savedId,
    preference_snapshot: {
      revision: 1,
      style_dna: {},
      body_profile: {},
      fit_preferences: {},
    },
    items: [
      {
        id: assetId,
        name: "Sample shirt",
        category: "top",
        subcategory: "shirt",
        attributes: {},
        asset_id: null,
      },
    ],
  };
  const writes: Record<string, unknown>[] = [];
  const fences: [string, string, unknown][] = [];
  function query(table: string) {
    let update: Record<string, unknown> | undefined;
    const predicates: ((row: Record<string, unknown>) => boolean)[] = [];
    const builder = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      contains: vi.fn().mockReturnThis(),
      eq: vi.fn((field: string, value: unknown) => {
        fences.push(["eq", field, value]);
        predicates.push((row) => row[field] === value);
        return builder;
      }),
      is: vi.fn((field: string, value: unknown) => {
        fences.push(["is", field, value]);
        predicates.push((row) => row[field] === value);
        return builder;
      }),
      gt: vi.fn((field: string, value: string) => {
        fences.push(["gt", field, value]);
        predicates.push(
          (row) => typeof row[field] === "string" && row[field] > value,
        );
        return builder;
      }),
      update: vi.fn((value: Record<string, unknown>) => {
        update = value;
        writes.push(value);
        return builder;
      }),
      maybeSingle: vi.fn(async () => {
        if (table === "saved_look_snapshots")
          return { data: snapshot, error: null };
        if (table === "workflow_operation_events")
          return { data: state.events[0] ?? null, error: null };
        if (table !== "workflow_operations")
          throw new Error("Unexpected test table");
        if (update) {
          if ("input" in update) {
            state.constraintRejections++;
            return { data: null, error: { code: "23514" } };
          }
          if (!predicates.every((predicate) => predicate(operation)))
            return { data: null, error: null };
          Object.assign(operation, update);
        }
        return { data: { ...operation }, error: null };
      }),
    };
    return builder;
  }
  const client = {
    from: vi.fn(query),
    rpc: vi.fn((name: string, args: Record<string, unknown>) => {
      let error = null;
      if (name === "claim_workflow_operation") {
        operation.status = "running";
        operation.attempt_count++;
        operation.lease_until = new Date(Date.now() + 280_000).toISOString();
      } else if (name === "finish_workflow_operation") {
        operation.status = String(args.p_status);
        operation.safe_error_code = String(args.p_safe_error_code);
        operation.result_ref = args.p_result_ref as Record<string, unknown>;
        operation.lease_until = null;
      } else if (name === "stylora_record_operation_event") {
        if (state.eventFailure) error = { code: "P0001" };
        else
          state.events.push({
            payload: args.p_payload as Record<string, unknown>,
          });
      } else if (name === "complete_saved_avatar") {
        operation.status = "succeeded";
        operation.lease_until = null;
        operation.result_ref = {
          assetId,
          renderFingerprint: "c".repeat(64),
          savedLookId: savedId,
        };
      } else throw new Error("Unexpected test RPC");
      const result = Promise.resolve({ data: { ...operation }, error });
      return Object.assign(result, { abortSignal: () => result });
    }),
  };
  mocks.database.mockReturnValue({ client, workspaceId, writesEnabled: true });
  mocks.settings.mockReturnValue(settings);
  mocks.render.mockResolvedValue({
    assetId,
    renderFingerprint: "c".repeat(64),
    createdAsset: false,
  });
  return { state, writes, fences };
}

function retry(state: ReturnType<typeof setup>["state"]) {
  Object.assign(state.operation, {
    status: "queued",
    result_ref: null,
    safe_error_code: null,
    lease_until: null,
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.promptVersion = "avatar-prompt.v1";
});

describe("saved-avatar render capture", () => {
  it("generates with the immutable-input database guard enabled and keeps final asset references", async () => {
    const { state, writes, fences } = setup();
    const originalInput = structuredClone(state.operation.input);
    expect((await runSavedAvatar(operationId)).status).toBe("succeeded");
    expect(state.operation.input).toEqual(originalInput);
    expect(state.constraintRejections).toBe(0);
    expect(writes.every((write) => !("input" in write))).toBe(true);
    expect(mocks.render).toHaveBeenCalledOnce();
    expect(state.events[0].payload).toMatchObject({
      savedAvatarRenderContext: { renderSettings: settings },
    });
    expect(state.operation.result_ref).toEqual({
      assetId,
      renderFingerprint: "c".repeat(64),
      savedLookId: savedId,
    });
    for (const fence of [
      ["eq", "workspace_id", workspaceId],
      ["eq", "id", operationId],
      ["eq", "attempt_count", 1],
      ["eq", "input_fingerprint", "a".repeat(64)],
      ["eq", "status", "running"],
      ["is", "cancel_requested_at", null],
    ])
      expect(fences).toContainEqual(fence);
    expect(
      fences.some(([kind, field]) => kind === "gt" && field === "lease_until"),
    ).toBe(true);
  });

  it("recovers the same settings after finish and retry erase result references", async () => {
    const { state } = setup();
    mocks.render.mockRejectedValueOnce(
      new OperationError("PROVIDER_NETWORK_ERROR", "Unavailable", 503, true),
    );
    expect((await runSavedAvatar(operationId)).status).toBe("failed");
    expect(state.operation.result_ref).toMatchObject({
      retryable: true,
      renderContext: { renderSettings: settings },
    });
    retry(state);
    mocks.settings.mockReturnValue({ ...settings, quality: "high" });
    expect((await runSavedAvatar(operationId)).status).toBe("succeeded");
    expect(mocks.render.mock.calls[1][0].renderSettings).toEqual(settings);
  });

  it("rejects a changed prompt policy before another provider request", async () => {
    const { state } = setup();
    mocks.render.mockRejectedValueOnce(
      new OperationError("PROVIDER_NETWORK_ERROR", "Unavailable", 503, true),
    );
    await runSavedAvatar(operationId);
    retry(state);
    mocks.promptVersion = "avatar-prompt.v2";
    expect((await runSavedAvatar(operationId)).status).toBe("failed");
    expect(state.operation.safe_error_code).toBe("AVATAR_RUNTIME_CHANGED");
    expect(mocks.render).toHaveBeenCalledOnce();
  });

  it("never calls the provider if durable context capture fails", async () => {
    const { state } = setup();
    state.eventFailure = true;
    expect((await runSavedAvatar(operationId)).status).toBe("failed");
    expect(state.operation.result_ref).toMatchObject({ retryable: false });
    expect(mocks.render).not.toHaveBeenCalled();
  });
});
