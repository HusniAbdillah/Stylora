import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderAndStoreAvatar } from "./image";

const mocks = vi.hoisted(() => ({
  database: vi.fn(),
  generate: vi.fn(),
  read: vi.fn(),
  upload: vi.fn(),
  verify: vi.fn(),
  prepare: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  getWorkspaceDatabase: mocks.database,
  requireWorkspaceWrites: vi.fn(),
}));
vi.mock("@/lib/supabase/storage", () => ({
  readVerifiedWorkspaceStorageAsset: mocks.read,
  createWorkspaceSignedUpload: mocks.upload,
  verifyWorkspaceStorageAsset: mocks.verify,
}));
vi.mock("@/features/ai/openai", () => ({
  IMAGE_MODEL: "gpt-image-1.5",
  AVATAR_PROMPT_VERSION: "avatar.v1",
  FASHION_SCHEMA_VERSION: "fashion-item.v1",
  FASHION_KNOWLEDGE_VERSION: "knowledge.v1",
  generateFashionImage: mocks.generate,
}));
vi.mock("@/features/ai/reference-image", () => ({
  prepareReferenceImage: mocks.prepare,
}));

const assetId = "873f4581-4ee6-4547-937f-53da95a60111";
const item = {
  id: "5b611486-d163-4891-af5a-cc49469b2331",
  name: "Sample shirt",
  category: "top",
  subcategory: "shirt",
  description: "Sample shirt.",
  attributes: {},
  revision: 1,
  asset_id: assetId,
};
function setup(reuse: boolean) {
  const query = (table: string) => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      contains: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({
        data: reuse
          ? table === "assets"
            ? { id: assetId }
            : { result_ref: { assetId } }
          : null,
        error: null,
      })),
    };
    return builder;
  };
  mocks.database.mockReturnValue({
    workspaceId: "cccf56bf-ac67-417e-bef1-f43dc6a87aa1",
    writesEnabled: true,
    client: {
      from: query,
      storage: { from: () => ({ upload: async () => ({ error: null }) }) },
    },
  });
  mocks.read.mockResolvedValue({
    bytes: new Uint8Array([1]),
    mimeType: "image/png",
  });
  mocks.prepare.mockResolvedValue({
    bytes: new Uint8Array([1]),
    mimeType: "image/png",
  });
  mocks.generate.mockResolvedValue({
    bytes: new Uint8Array([137, 80, 78, 71]),
  });
  mocks.upload.mockResolvedValue({
    assetId,
    storagePath: "fixture/output.png",
  });
  mocks.verify.mockResolvedValue({ assetId });
}
beforeEach(() => vi.resetAllMocks());

describe("avatar provider metering boundaries", () => {
  it("does not reserve or count a model call for a reusable ready image", async () => {
    setup(true);
    const beforeGenerate = vi.fn();
    const afterGenerate = vi.fn();
    await expect(
      renderAndStoreAvatar({
        items: [item],
        preferences: {},
        beforeGenerate,
        afterGenerate,
      }),
    ).resolves.toMatchObject({ assetId, createdAsset: false });
    expect(beforeGenerate).not.toHaveBeenCalled();
    expect(afterGenerate).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("loads verified references before reserving the single actual provider call", async () => {
    setup(false);
    const beforeGenerate = vi.fn();
    const afterGenerate = vi.fn();
    await renderAndStoreAvatar({
      items: [item],
      preferences: {},
      beforeGenerate,
      afterGenerate,
    });
    const order = [
      mocks.read,
      mocks.prepare,
      beforeGenerate,
      mocks.generate,
      afterGenerate,
    ].map((mock) => mock.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const mock of [beforeGenerate, mocks.generate, afterGenerate])
      expect(mock).toHaveBeenCalledOnce();
  });

  it("never calls the model when reserving its budget fails", async () => {
    setup(false);
    const failure = new Error("Reservation denied");
    const beforeGenerate = vi.fn().mockRejectedValue(failure);
    const afterGenerate = vi.fn();
    await expect(
      renderAndStoreAvatar({
        items: [item],
        preferences: {},
        beforeGenerate,
        afterGenerate,
      }),
    ).rejects.toBe(failure);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(afterGenerate).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("releases the provider slot after failure while preserving the actual provider error", async () => {
    setup(false);
    const failure = new Error("Provider unavailable");
    mocks.generate.mockRejectedValue(failure);
    const afterGenerate = vi
      .fn()
      .mockRejectedValue(new Error("Release unavailable"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(
        renderAndStoreAvatar({
          items: [item],
          preferences: {},
          beforeGenerate: vi.fn(),
          afterGenerate,
        }),
      ).rejects.toBe(failure);
      expect(afterGenerate).toHaveBeenCalledOnce();
      expect(warning).toHaveBeenCalledWith(
        JSON.stringify({ event: "avatar_provider_release_failed" }),
      );
      expect(mocks.upload).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });

  it("preserves a valid generated image when releasing its slot is unavailable", async () => {
    setup(false);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(
        renderAndStoreAvatar({
          items: [item],
          preferences: {},
          beforeGenerate: vi.fn(),
          afterGenerate: vi
            .fn()
            .mockRejectedValue(new Error("Release unavailable")),
        }),
      ).resolves.toMatchObject({ assetId, createdAsset: true });
      expect(mocks.verify).toHaveBeenCalledWith(assetId);
    } finally {
      warning.mockRestore();
    }
  });

  it("keeps a verified paid result for checkpointing when the execution deadline expires during storage", async () => {
    setup(false);
    const controller = new AbortController();
    mocks.verify.mockImplementationOnce(async () => {
      controller.abort(new DOMException("Execution expired", "TimeoutError"));
      return { assetId };
    });
    await expect(
      renderAndStoreAvatar({
        items: [item],
        preferences: {},
        signal: controller.signal,
      }),
    ).resolves.toMatchObject({ assetId, createdAsset: true });
  });
});
