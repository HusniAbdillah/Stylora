import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CREATE_RUNTIME_VERSION } from "./create-policy";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  download: vi.fn(),
  requestFashion: vi.fn(),
  getLookContext: vi.fn(),
  scope: vi.fn(),
  personalization: vi.fn(),
  inventory: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  getWorkspaceDatabase: () => ({
    client: {
      rpc: mocks.rpc,
      from: mocks.from,
      storage: { from: () => ({ download: mocks.download }) },
    },
    workspaceId: "workspace",
    writesEnabled: true,
  }),
  requireWorkspaceWrites: vi.fn(),
}));
vi.mock("@/features/inspiration/server", () => ({
  getLookContext: mocks.getLookContext,
}));
vi.mock("@/features/preferences/server", () => ({
  getPersonalizationSnapshot: mocks.personalization,
}));
vi.mock("@/features/matching/backend", () => ({
  calculateMatches: vi.fn(),
  listInventory: mocks.inventory,
}));
vi.mock("@/lib/ai/provider", async (original) => ({
  ...(await original<typeof import("@/lib/ai/provider")>()),
  requestFashion: mocks.requestFashion,
  withFashionOperation: mocks.scope,
}));
import {
  controlOperation,
  executeOperation,
  startLookOperation,
} from "./create";

const lookId = "6762a315-1490-409b-909b-f424450b06af";
const assetId = "ad77a8cf-c749-48b1-b463-d21dd65ab503";
const draftId = "0913da75-d639-4a78-849b-a0d37553c837";
const operationId = "27521082-6561-47ac-a732-ae19901b7849";
const base = {
  id: operationId,
  kind: "inspiration_description",
  status: "queued",
  subject_type: "look",
  subject_id: lookId,
  input_revision: 1,
  input_fingerprint: "initial",
  input: {
    lookId,
    lookRevision: 1,
    assetId,
    draftId,
    inventoryMode: "combined",
    runtimeVersion: CREATE_RUNTIME_VERSION,
  },
  attempt_count: 1,
  provider_call_count: 0,
  result_ref: null as unknown,
  lease_until: null,
  safe_error_code: null,
  model: "fixture",
  prompt_version: "fixture",
  schema_version: "fixture",
};
let row = { ...base };
let draftStatus = "active";
let assetStatus = "ready";

beforeEach(() => {
  vi.clearAllMocks();
  row = { ...base };
  draftStatus = "active";
  assetStatus = "ready";
  mocks.getLookContext.mockResolvedValue({
    look: {
      id: lookId,
      revision: 1,
      inspiration_asset_id: assetId,
      occasion: null,
      source_type: "live",
    },
    pieces: [],
  });
  mocks.personalization.mockResolvedValue({
    fingerprint: "preferences",
    preferenceData: {},
    preferences: {},
  });
  mocks.inventory.mockResolvedValue({ items: [], fingerprint: "inventory" });
  mocks.scope.mockImplementation((_context, run: () => Promise<unknown>) =>
    run(),
  );
  mocks.download.mockResolvedValue({
    data: new Blob(["synthetic image bytes"]),
    error: null,
  });
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      in: vi.fn(() => query),
      limit: vi.fn(() => query),
      abortSignal: vi.fn(() => query),
      maybeSingle: vi.fn(() => query),
      single: vi.fn(() => query),
      update: vi.fn((patch) => {
        if (table === "workflow_operations") row = { ...row, ...patch };
        return query;
      }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          error: null,
          data:
            table === "workflow_operations"
              ? row
              : table === "workflow_drafts"
                ? { id: draftId, status: draftStatus }
                : table === "assets"
                  ? {
                      status: assetStatus,
                      bucket: "inspiration",
                      storage_path: "fixture",
                      mime_type: "image/png",
                    }
                  : [],
        }).then(resolve),
    };
    return query;
  });
  mocks.rpc.mockImplementation(
    (name: string, input: Record<string, unknown>) => {
      if (name === "start_workflow_operation")
        row = {
          ...row,
          input: input.p_input as typeof base.input,
          input_fingerprint: String(input.p_input_fingerprint),
          kind: String(input.p_kind),
        };
      if (name === "claim_workflow_operation")
        row = { ...row, status: "running" };
      if (name === "control_create_operation")
        row = { ...row, status: "queued" };
      const response = Promise.resolve({ data: row, error: null });
      return Object.assign(response, { abortSignal: () => response });
    },
  );
});
afterEach(() => vi.unstubAllEnvs());

describe("Create allocation and execution gates", () => {
  it.each([null, "", "   "])(
    "allows a verified inspiration with optional occasion %s",
    async (occasion) => {
      mocks.getLookContext.mockResolvedValue({
        look: {
          id: lookId,
          revision: 1,
          inspiration_asset_id: assetId,
          occasion,
          source_type: "live",
        },
        pieces: [],
      });
      await startLookOperation(lookId, {
        kind: "inspiration_description",
        execute: false,
      });
      expect(mocks.rpc).toHaveBeenCalledWith(
        "start_workflow_operation",
        expect.objectContaining({
          p_input: expect.objectContaining({ occasion, draftId }),
        }),
      );
      expect(mocks.requestFashion).not.toHaveBeenCalled();
    },
  );
  it("rejects unverified images before allocating provider work", async () => {
    assetStatus = "pending";
    await expect(
      startLookOperation(lookId, {
        kind: "inspiration_description",
        execute: false,
      }),
    ).rejects.toMatchObject({ code: "image_not_ready" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects outfit allocation until all current matches are committed", async () => {
    mocks.getLookContext.mockResolvedValue({
      look: {
        id: lookId,
        revision: 1,
        inspiration_asset_id: assetId,
        occasion: null,
        source_type: "live",
      },
      pieces: [{ id: operationId }],
    });
    await expect(
      startLookOperation(lookId, { kind: "outfit_options", execute: false }),
    ).rejects.toMatchObject({ code: "matches_not_ready" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("claims a 280-second lease but supersedes discarded drafts before inference", async () => {
    draftStatus = "discarded";
    await executeOperation(operationId);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "claim_workflow_operation",
      expect.objectContaining({ p_lease_seconds: 280 }),
    );
    expect(mocks.scope.mock.calls[0][0]).toMatchObject({
      signal: expect.any(AbortSignal),
      deadline: expect.any(Number),
    });
    expect(
      mocks.scope.mock.calls[0][0].deadline - Date.now(),
    ).toBeLessThanOrEqual(240000);
    expect(row.status).toBe("superseded");
    expect(mocks.requestFashion).not.toHaveBeenCalled();
  });
  it("rechecks explicit discard after the provider result and before commit", async () => {
    mocks.requestFashion.mockImplementation(async () => {
      draftStatus = "discarded";
      return { data: { pieces: [] }, metadata: { model: "unit-fixture" } };
    });
    await executeOperation(operationId);
    expect(row.status).toBe("superseded");
    expect(
      mocks.rpc.mock.calls.some(([name]) => name === "finish_create_operation"),
    ).toBe(false);
  });
  it("returns a queued retry for worker mode without executing in the request", async () => {
    await startLookOperation(lookId, {
      kind: "inspiration_description",
      execute: false,
    });
    row = {
      ...row,
      status: "failed",
      provider_call_count: 1,
      result_ref: { retryable: true },
    };
    vi.stubEnv("STYLORA_EXECUTION_MODE", "worker");
    vi.stubEnv("STYLORA_WORKER_SECRET", "x".repeat(43));
    const operation = await controlOperation(operationId, "retry");
    expect(operation.status).toBe("queued");
    expect(mocks.scope).not.toHaveBeenCalled();
  });
});
