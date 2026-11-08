import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  OperationClaim,
  OperationHandler,
} from "@/features/operations/server";
import { OperationError } from "@/features/operations/errors";
import { previewImageStatus, runPreviewOperation } from "./generation";

const mocks = vi.hoisted(() => ({
  database: vi.fn(),
  read: vi.fn(),
  run: vi.fn(),
  render: vi.fn(),
  restore: vi.fn(),
  discard: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  getWorkspaceDatabase: mocks.database,
  requireWorkspaceWrites: vi.fn(),
}));
vi.mock("@/lib/supabase/storage", () => ({
  createWorkspaceSignedRead: vi.fn(),
}));
vi.mock("@/features/operations/server", async () => ({
  OperationError: (await import("@/features/operations/errors")).OperationError,
  readOperation: mocks.read,
  runOperation: mocks.run,
  startOperation: vi.fn(),
  assertWorkflowRpc: vi.fn(),
}));
vi.mock("@/features/operations/provider-budget", () => ({
  reserveWorkflowProviderCall: vi.fn(),
  releaseWorkflowProviderCall: vi.fn(),
}));
vi.mock("@/features/ai/openai", () => ({
  IMAGE_MODEL: "gpt-image-1.5",
  AVATAR_PROMPT_VERSION: "avatar.v1",
  FASHION_SCHEMA_VERSION: "fashion-item.v1",
  FASHION_KNOWLEDGE_VERSION: "knowledge.v1",
}));
vi.mock("./image", () => ({
  normalizeAvatarItems: (items: unknown[]) => items,
  avatarRenderFingerprint: (
    _items: unknown,
    prefs: { revision: number },
    settings: { quality: string },
  ) => `${prefs.revision}:${settings.quality}`,
  getAvatarRenderSettings: mocks.settings,
  renderAndStoreAvatar: mocks.render,
  restoreAvatarCheckpoint: mocks.restore,
  discardPendingAvatar: mocks.discard,
}));

const workspaceId = "cccf56bf-ac67-417e-bef1-f43dc6a87aa1";
const operationId = "208eddd1-b0af-4bf1-99f6-3d6e79f3000c";
const draftId = "5b611486-d163-4891-af5a-cc49469b2331";
const assetId = "873f4581-4ee6-4547-937f-53da95a60111";
type AvatarOutput = {
  assetId: string;
  renderFingerprint: string;
  createdAsset: boolean;
};

async function setup() {
  const state = {
    revision: 3,
    preferenceRevision: 1,
    quality: "medium",
    status: "succeeded",
    commitFailure: false,
    commitErrorCode: "08006",
    operationStatus: "failed",
    retryable: false,
  };
  const client = {
    from: vi.fn((table: string) => {
      const filters: [string, unknown][] = [];
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((field: string, value: unknown) => {
          filters.push([field, value]);
          return query;
        }),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({
          data:
            table === "workflow_operations"
              ? filters.some(
                  ([field, value]) =>
                    field === "status" && value === "succeeded",
                )
                ? null
                : {
                    id: operationId,
                    status: state.operationStatus,
                    input: { renderFingerprint: "1:medium" },
                    model: "gpt-image-1.5",
                    prompt_version: "avatar.v1",
                    result_ref: { retryable: state.retryable },
                    safe_error_code: "PREVIEW_COMMIT_REJECTED",
                    created_at: "2026-11-08T00:00:00Z",
                    completed_at: null,
                  }
              : table === "workflow_drafts"
                ? {
                    id: draftId,
                    revision: state.revision,
                    payload: { selection: { top: assetId } },
                  }
                : { revision: state.preferenceRevision },
          error: null,
        })),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data: [
              {
                id: assetId,
                category: "top",
                subcategory: "shirt",
                asset_id: assetId,
              },
            ],
            error: null,
          }).then(resolve),
      };
      return query;
    }),
    rpc: vi.fn(async () => ({
      data: state.commitFailure ? null : { status: state.status },
      error: state.commitFailure ? { code: state.commitErrorCode } : null,
    })),
  };
  mocks.database.mockReturnValue({ client, workspaceId, writesEnabled: true });
  mocks.read.mockResolvedValue({
    id: operationId,
    kind: "preview_image",
    subject_type: "draft",
    subject_id: draftId,
  });
  mocks.settings.mockImplementation(() => ({ quality: state.quality }));
  mocks.restore.mockResolvedValue({
    assetId,
    renderFingerprint: "1:medium",
    createdAsset: false,
  });
  await runPreviewOperation(operationId);
  const handler = mocks.run.mock.calls[0][1] as OperationHandler<AvatarOutput>;
  const claim: OperationClaim = {
    operationId,
    inputRevision: 3,
    inputFingerprint: "a".repeat(64),
    attemptCount: 2,
    input: { renderFingerprint: "1:medium" },
    signal: new AbortController().signal,
  };
  return { state, handler, claim, client };
}
beforeEach(() => vi.resetAllMocks());

describe("Preview image checkpoint boundaries", () => {
  it("uses a new explicit request for terminal failure while retaining retryable and active operation identities", async () => {
    const { state } = await setup();
    const terminal = await previewImageStatus(draftId);
    expect(terminal.operationId).toBeNull();
    expect(terminal.job.status).toBe("failed");
    expect(terminal.job.errorMessage).toBeTruthy();
    state.retryable = true;
    expect((await previewImageStatus(draftId)).operationId).toBe(operationId);
    state.retryable = false;
    state.operationStatus = "running";
    expect((await previewImageStatus(draftId)).operationId).toBe(operationId);
  });
  it("serializes only image references and restores current inputs without executing the provider", async () => {
    const { handler, claim } = await setup();
    const output = {
      assetId,
      renderFingerprint: "1:medium",
      createdAsset: true,
    };
    expect(handler.checkpoint?.serialize(output)).toEqual({
      result: { assetId, renderFingerprint: "1:medium" },
      metadata: {},
    });
    await expect(
      handler.checkpoint?.restore(
        claim,
        { assetId, renderFingerprint: "1:medium" },
        {},
      ),
    ).resolves.toMatchObject({ assetId, createdAsset: false });
    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.restore).toHaveBeenCalledWith(
      { assetId, renderFingerprint: "1:medium" },
      "1:medium",
      claim.signal,
      {},
    );
  });

  it.each(["revision", "preferenceRevision", "quality"] as const)(
    "rejects changed %s before restoring image bytes",
    async (field) => {
      const { handler, claim, state } = await setup();
      if (field === "quality") state.quality = "high";
      else state[field]++;
      await expect(
        handler.checkpoint?.restore(claim, { assetId }, {}),
      ).rejects.toMatchObject({ code: "INPUT_SUPERSEDED", status: 409 });
      expect(mocks.restore).not.toHaveBeenCalled();
      expect(mocks.render).not.toHaveBeenCalled();
    },
  );

  it("retains a new pending image when commit acknowledgement fails", async () => {
    const { state, handler, claim, client } = await setup();
    state.commitFailure = true;
    await expect(
      handler.commit(claim, {
        assetId,
        renderFingerprint: "1:medium",
        createdAsset: true,
      }),
    ).rejects.toBeInstanceOf(OperationError);
    expect(mocks.discard).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledWith(
      "complete_preview_operation",
      expect.objectContaining({
        p_workspace_id: workspaceId,
        p_operation_id: operationId,
        p_attempt_count: 2,
        p_input_fingerprint: claim.inputFingerprint,
      }),
    );
  });

  it.each([
    ["40001", "INPUT_SUPERSEDED", 409],
    ["23514", "PREVIEW_COMMIT_REJECTED", 409],
    ["P0002", "PREVIEW_COMMIT_NOT_FOUND", 404],
  ])(
    "does not retry a rejected image commit (%s) as a storage outage",
    async (databaseCode, code, status) => {
      const { state, handler, claim } = await setup();
      state.commitFailure = true;
      state.commitErrorCode = String(databaseCode);
      await expect(
        handler.commit(claim, {
          assetId,
          renderFingerprint: "1:medium",
          createdAsset: false,
        }),
      ).rejects.toMatchObject({ code, status, retryable: false });
      expect(mocks.discard).not.toHaveBeenCalled();
      expect(mocks.render).not.toHaveBeenCalled();
    },
  );

  it.each(["cancelled", "superseded"])(
    "cleans pending output only after confirmed %s",
    async (status) => {
      const { state, handler, claim } = await setup();
      state.status = status;
      await handler.commit(claim, {
        assetId,
        renderFingerprint: "1:medium",
        createdAsset: false,
      });
      expect(mocks.discard).toHaveBeenCalledWith(assetId);
    },
  );
});
