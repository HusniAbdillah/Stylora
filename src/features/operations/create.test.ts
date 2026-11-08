import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CREATE_RUNTIME_VERSION,
  createOperationFingerprint,
} from "./create-policy";
import { buildFashionPrompt } from "@/prompts/fashion";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  download: vi.fn(),
  requestFashion: vi.fn(),
  getLookContext: vi.fn(),
  scope: vi.fn(),
  personalization: vi.fn(),
  inventory: vi.fn(),
  health: vi.fn(),
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
vi.mock("./health", () => ({ assertWorkflowExecutorAvailable: mocks.health }));
vi.mock("./limits", () => ({
  workflowProviderLimits: () => ({ textDailyLimit: 150, imageDailyLimit: 50 }),
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
const providerSettings = {
  version: "fashion-request.v1",
  model: "unit-test-model",
  reasoningEffort: "low",
  maxOutputTokens: 24000,
};
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
    providerSettings,
    occasion: null,
  },
  attempt_count: 0,
  provider_call_count: 0,
  result_ref: null as unknown,
  lease_until: null,
  safe_error_code: null,
  model: providerSettings.model,
  prompt_version: "fixture",
  schema_version: "fixture",
};
let row = { ...base };
let draftStatus = "active";
let assetStatus = "ready";
let checkpoint: Record<string, unknown> | null = null;
let finishFailures = 0;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requestFashion.mockReset();
  mocks.health.mockReset().mockResolvedValue(undefined);
  vi.stubEnv("OPENAI_TEXT_MODEL", providerSettings.model);
  vi.stubEnv("OPENAI_DESCRIPTION_MODEL", "");
  row = { ...base };
  row.input_fingerprint = createOperationFingerprint({
    kind: "inspiration_description",
    input: row.input,
    versions: buildFashionPrompt("inspiration_description").versions,
    model: row.model,
    subjectId: row.subject_id,
    revision: row.input_revision,
  });
  draftStatus = "active";
  assetStatus = "ready";
  checkpoint = null;
  finishFailures = 0;
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
                : table === "operation_result_checkpoints"
                  ? checkpoint
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
        row = {
          ...row,
          status: "running",
          attempt_count: row.attempt_count + 1,
        };
      if (name === "control_create_operation")
        row = { ...row, status: "queued" };
      if (name === "checkpoint_workflow_result")
        checkpoint = {
          result: input.p_result,
          metadata: input.p_metadata,
          kind: row.kind,
          prompt_version: row.prompt_version,
          schema_version: row.schema_version,
          model: row.model,
        };
      let error: { code: string } | null = null;
      if (name === "finish_create_operation") {
        if (finishFailures-- > 0) error = { code: "08006" };
        else row = { ...row, status: "succeeded" };
      }
      const response = Promise.resolve({
        data: name === "checkpoint_workflow_result" ? checkpoint : row,
        error,
      });
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
  it("does not allocate paid work when the worker heartbeat is unavailable", async () => {
    mocks.health.mockRejectedValue(new Error("synthetic worker unavailable"));
    await expect(
      startLookOperation(lookId, {
        kind: "inspiration_description",
        execute: false,
      }),
    ).rejects.toThrow("synthetic worker unavailable");
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
      expect.objectContaining({
        p_lease_seconds: 280,
        p_text_daily_limit: 150,
        p_image_daily_limit: 50,
      }),
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
    const scope = mocks.scope.mock.calls[0][0];
    await scope.reserveCall();
    await scope.releaseCall();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "reserve_workflow_provider_call",
      expect.objectContaining({
        p_input_fingerprint: row.input_fingerprint,
        p_text_daily_limit: 150,
        p_image_daily_limit: 50,
      }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "release_workflow_provider_call",
      expect.objectContaining({
        p_input_fingerprint: row.input_fingerprint,
      }),
    );
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
  it("supersedes queued work if its captured provider controls changed", async () => {
    vi.stubEnv("OPENAI_DESCRIPTION_REASONING_EFFORT", "none");
    await executeOperation(operationId);
    expect(row.status).toBe("superseded");
    expect(mocks.requestFashion).not.toHaveBeenCalled();
  });
  it("recovers a checkpoint after commit failure without another image download or paid call", async () => {
    const garment = {
      name: "Fixture shirt",
      category: "top",
      subcategory: null,
      description: "A visible shirt.",
      attributes: {},
      confidence: 0.8,
      uncertainty: [],
      observations: ["name", "category", "description"].map((path) => ({
        path,
        source: "visual_inference",
        state: "observed",
        confidence: 0.8,
        evidence: "Visible in the fixture image.",
        uncertainty: null,
      })),
    };
    mocks.requestFashion.mockResolvedValue({
      data: { pieces: [garment] },
      metadata: { model: row.model },
    });
    finishFailures = 1;
    await executeOperation(operationId);
    expect(row.status).toBe("failed");
    expect(row.result_ref).toMatchObject({
      checkpointed: true,
      retryable: true,
    });
    expect(checkpoint).not.toBeNull();
    row = { ...row, status: "queued", provider_call_count: 3 };
    await executeOperation(operationId);
    expect(row.status).toBe("succeeded");
    expect(mocks.requestFashion).toHaveBeenCalledTimes(1);
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(
      mocks.rpc.mock.calls.filter(
        ([name]) => name === "checkpoint_workflow_result",
      ),
    ).toHaveLength(1);
    const commits = mocks.rpc.mock.calls.filter(
      ([name]) => name === "finish_create_operation",
    );
    expect(commits).toHaveLength(2);
    expect(commits[1][1].p_result).toEqual(commits[0][1].p_result);
    expect(commits[1][1].p_metadata).toEqual(commits[0][1].p_metadata);
  });
  it("fails a corrupted checkpoint without falling back to another paid inference", async () => {
    checkpoint = {
      result: { pieces: [] },
      metadata: {},
      kind: row.kind,
      prompt_version: row.prompt_version,
      schema_version: row.schema_version,
      model: row.model,
    };
    await executeOperation(operationId);
    expect(row).toMatchObject({
      status: "failed",
      safe_error_code: "operation_checkpoint_invalid",
      result_ref: { retryable: false, checkpointed: true },
    });
    expect(mocks.requestFashion).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
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
