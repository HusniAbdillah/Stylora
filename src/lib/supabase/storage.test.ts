import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { StorageApiError } from "@supabase/supabase-js";
import { apiRoute } from "@/lib/api";
import { getWorkspaceDatabase, type WorkspaceDatabase } from "./server";
import {
  createWorkspaceSignedRead,
  createWorkspaceSignedUpload,
  STORAGE_MAX_BYTES,
  STORAGE_READ_TTL_SECONDS,
  StorageAssetError,
  type StorageUploadInput,
  verifyWorkspaceStorageAsset,
} from "./storage";

vi.mock("server-only", () => ({}));
vi.mock("./server", async (importOriginal) => {
  const original = await importOriginal<typeof import("./server")>();
  return { ...original, getWorkspaceDatabase: vi.fn() };
});

const workspaceId = "cccf56bf-ac67-417e-bef1-f43dc6a87aa1";
const foreignWorkspaceId = "84817460-c1da-409e-ac87-8b20b152879e";
const assetId = "a3b3eb59-ceb9-47a9-a179-e23c65c920b2";
const objectId = "f7d88425-132e-4410-877d-4bf066bb5753";

function assetFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: assetId,
    workspace_id: workspaceId,
    bucket: "wardrobe",
    storage_path: `${workspaceId}/${assetId}/${objectId}.png`,
    mime_type: "image/png",
    byte_size: 120,
    status: "ready",
    ...overrides,
  };
}

function setup(asset: ReturnType<typeof assetFixture> | null = assetFixture()) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: asset, error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
  };
  const storage = {
    createSignedUploadUrl: vi.fn().mockResolvedValue({
      data: {
        signedUrl: "https://example.supabase.co/signed-upload",
        token: "synthetic-token",
      },
      error: null,
    }),
    createSignedUrl: vi.fn().mockResolvedValue({
      data: { signedUrl: "https://example.supabase.co/signed-read" },
      error: null,
    }),
    download: vi.fn(),
  };
  const client = {
    from: vi.fn().mockReturnValue(query),
    storage: { from: vi.fn().mockReturnValue(storage) },
  };
  const context = { client, workspaceId, writesEnabled: true };
  vi.mocked(getWorkspaceDatabase).mockReturnValue(
    context as unknown as WorkspaceDatabase,
  );
  return { query, storage, client, context };
}

async function pngFixture() {
  const bytes = await sharp({
    create: { width: 2, height: 3, channels: 3, background: "#73091D" },
  })
    .png()
    .toBuffer();
  return new Blob([new Uint8Array(bytes)], { type: "image/png" });
}

beforeEach(() => vi.clearAllMocks());

describe("Storage failure metadata", () => {
  it.each([0, 408, 429, 500, 502, 503, 504])(
    "preserves transient database transport status %s",
    async (status) => {
      const { query, storage } = setup();
      query.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: "private detail" },
        status,
      });
      await expect(createWorkspaceSignedRead(assetId)).rejects.toMatchObject({
        code: "STORAGE_ASSET_READ_FAILED",
        upstreamStatus: status,
        retryable: true,
      });
      expect(storage.createSignedUrl).not.toHaveBeenCalled();
    },
  );

  it("preserves asset allocation failure status", async () => {
    const { query, storage } = setup();
    query.insert.mockResolvedValue({
      error: { message: "private detail" },
      status: 503,
    });
    await expect(
      createWorkspaceSignedUpload({
        bucket: "wardrobe",
        mimeType: "image/png",
        byteSize: 120,
      }),
    ).rejects.toMatchObject({ upstreamStatus: 503, retryable: true });
    expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it.each([
    [
      "createSignedUploadUrl",
      () =>
        createWorkspaceSignedUpload({
          bucket: "wardrobe",
          mimeType: "image/png",
          byteSize: 120,
        }),
    ],
    ["createSignedUrl", () => createWorkspaceSignedRead(assetId)],
    ["download", () => verifyWorkspaceStorageAsset(assetId)],
  ] as const)("preserves HTTP failure status for %s", async (method, run) => {
    const { storage } = setup();
    storage[method].mockResolvedValue({
      data: null,
      error: new StorageApiError("private detail", 502, "502"),
    });
    await expect(run()).rejects.toMatchObject({
      upstreamStatus: 502,
      retryable: true,
    });
  });

  it("recognizes the SDK network wrapper without treating every unknown error as transient", async () => {
    const { storage } = setup();
    const network = Object.assign(new Error("private detail"), {
      name: "StorageUnknownError",
      originalError: new TypeError("fetch failed"),
    });
    storage.createSignedUrl.mockResolvedValue({ data: null, error: network });
    await expect(createWorkspaceSignedRead(assetId)).rejects.toMatchObject({
      upstreamStatus: 0,
      retryable: true,
    });
    storage.createSignedUrl.mockResolvedValue({
      data: null,
      error: new Error("unknown"),
    });
    await expect(createWorkspaceSignedRead(assetId)).rejects.toMatchObject({
      upstreamStatus: undefined,
      retryable: false,
    });
  });

  it.each([undefined, 400, 401, 403, 404, 409, 415, 422, 501, 505])(
    "keeps unknown and terminal statuses terminal (%s)",
    (status) => {
      expect(
        new StorageAssetError("STORAGE_SIGN_FAILED", "Safe error", status)
          .retryable,
      ).toBe(false);
    },
  );

  it("keeps validation failures terminal even with transport-like metadata", () => {
    expect(
      new StorageAssetError("STORAGE_IMAGE_INVALID", "Safe error", 503)
        .retryable,
    ).toBe(false);
  });

  it.each([
    [401, false],
    [503, true],
  ] as const)(
    "preserves retry eligibility through the HTTP boundary for %s",
    async (status, retryable) => {
      const { storage } = setup();
      storage.createSignedUrl.mockResolvedValue({
        data: null,
        error: new StorageApiError("private detail", status, String(status)),
      });
      const response = await apiRoute(() => createWorkspaceSignedRead(assetId));
      const body = await response.json();
      expect(body.error.retryable).toBe(retryable);
      expect(JSON.stringify(body)).not.toContain("private detail");
    },
  );
});

describe("workspace Storage upload", () => {
  it.each(["inspiration", "wardrobe", "previews"] as const)(
    "allocates a pending %s asset with a server-generated scoped path",
    async (bucket) => {
      const { query, storage } = setup();
      const result = await createWorkspaceSignedUpload({
        bucket,
        mimeType: "image/png",
        byteSize: 120,
      });
      const stored = query.insert.mock.calls[0][0];

      expect(stored).toMatchObject({
        workspace_id: workspaceId,
        bucket,
        status: "pending",
        byte_size: 120,
      });
      expect(result.storagePath.split("/")).toEqual([
        workspaceId,
        result.assetId,
        expect.stringMatching(/^[0-9a-f-]{36}\.png$/),
      ]);
      expect(stored.storage_path).toBe(result.storagePath);
      expect(storage.createSignedUploadUrl).toHaveBeenCalledWith(
        result.storagePath,
        { upsert: false },
      );
    },
  );

  it("rejects uploads before allocating an asset when shared writes are disabled", async () => {
    const { context, client, storage } = setup();
    context.writesEnabled = false;
    await expect(
      createWorkspaceSignedUpload({
        bucket: "wardrobe",
        mimeType: "image/png",
        byteSize: 120,
      }),
    ).rejects.toMatchObject({ code: "WORKSPACE_WRITES_DISABLED" });
    expect(client.from).not.toHaveBeenCalled();
    expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it.each([
    { bucket: "public", mimeType: "image/png", byteSize: 120 },
    { bucket: "previews", mimeType: "image/jpeg", byteSize: 120 },
    { bucket: "wardrobe", mimeType: "text/plain", byteSize: 120 },
    { bucket: "wardrobe", mimeType: "image/png", byteSize: 0 },
    {
      bucket: "wardrobe",
      mimeType: "image/png",
      byteSize: STORAGE_MAX_BYTES + 1,
    },
    { bucket: "wardrobe", mimeType: "image/png", byteSize: 1.5 },
    {
      bucket: "wardrobe",
      mimeType: "image/png",
      byteSize: 120,
      workspaceId: foreignWorkspaceId,
    },
  ])(
    "rejects invalid upload details without contacting Storage: %j",
    async (input) => {
      const { client } = setup();
      await expect(
        createWorkspaceSignedUpload(input as StorageUploadInput),
      ).rejects.toMatchObject({ code: "INVALID_STORAGE_UPLOAD" });
      expect(client.from).not.toHaveBeenCalled();
      expect(client.storage.from).not.toHaveBeenCalled();
    },
  );

  it("does not sign an upload when pending asset allocation fails", async () => {
    const { query, storage } = setup();
    query.insert.mockResolvedValue({
      error: { message: "private database detail" },
    });
    await expect(
      createWorkspaceSignedUpload({
        bucket: "wardrobe",
        mimeType: "image/png",
        byteSize: 120,
      }),
    ).rejects.toMatchObject({ code: "STORAGE_ASSET_CREATE_FAILED" });
    expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });
});

describe("workspace Storage reads", () => {
  it("scopes ready asset lookup before issuing a short-lived signed read", async () => {
    const { context, query, storage } = setup();
    context.writesEnabled = false;
    const result = await createWorkspaceSignedRead(assetId);
    expect(query.eq).toHaveBeenCalledWith("workspace_id", workspaceId);
    expect(query.eq).toHaveBeenCalledWith("id", assetId);
    expect(query.in).toHaveBeenCalledWith("status", ["ready"]);
    expect(storage.createSignedUrl).toHaveBeenCalledWith(
      assetFixture().storage_path,
      STORAGE_READ_TTL_SECONDS,
    );
    expect(result.expiresIn).toBe(STORAGE_READ_TTL_SECONDS);
  });

  it.each([
    { workspace_id: foreignWorkspaceId },
    { storage_path: `${foreignWorkspaceId}/${assetId}/${objectId}.png` },
    { storage_path: `${workspaceId}/${objectId}/${assetId}.png` },
    { storage_path: `${workspaceId}/${assetId}/../${objectId}.png` },
    { status: "pending" },
    { status: "deleted" },
    { bucket: "public" },
    { bucket: "previews", mime_type: "image/webp" },
  ])(
    "never signs a foreign, malformed or unavailable asset: %j",
    async (overrides) => {
      const { client } = setup(assetFixture(overrides));
      await expect(createWorkspaceSignedRead(assetId)).rejects.toBeInstanceOf(
        Error,
      );
      expect(client.storage.from).not.toHaveBeenCalled();
    },
  );

  it("does not sign a missing asset", async () => {
    const { client } = setup(null);
    await expect(createWorkspaceSignedRead(assetId)).rejects.toMatchObject({
      code: "WORKSPACE_RESOURCE_NOT_FOUND",
    });
    expect(client.storage.from).not.toHaveBeenCalled();
  });
});

describe("uploaded image byte verification", () => {
  it("decodes uploaded bytes and returns metadata without marking the asset ready", async () => {
    const image = await pngFixture();
    const { query, storage } = setup(
      assetFixture({ byte_size: image.size, status: "pending" }),
    );
    storage.download.mockResolvedValue({ data: image, error: null });
    await expect(verifyWorkspaceStorageAsset(assetId)).resolves.toMatchObject({
      assetId,
      width: 2,
      height: 3,
      byteSize: image.size,
      mimeType: "image/png",
    });
    expect(query.insert).not.toHaveBeenCalled();
  });

  it("rejects metadata size mismatch before decoding", async () => {
    const image = await pngFixture();
    const { storage } = setup(
      assetFixture({ byte_size: image.size + 1, status: "pending" }),
    );
    storage.download.mockResolvedValue({ data: image, error: null });
    await expect(verifyWorkspaceStorageAsset(assetId)).rejects.toMatchObject({
      code: "STORAGE_IMAGE_INVALID",
    });
  });

  it("rejects a real image whose decoded format disagrees with its declared MIME", async () => {
    const bytes = await sharp({
      create: { width: 2, height: 3, channels: 3, background: "white" },
    })
      .jpeg()
      .toBuffer();
    const image = new Blob([new Uint8Array(bytes)], { type: "image/png" });
    const { storage } = setup(
      assetFixture({ byte_size: image.size, status: "pending" }),
    );
    storage.download.mockResolvedValue({ data: image, error: null });
    await expect(verifyWorkspaceStorageAsset(assetId)).rejects.toMatchObject({
      code: "STORAGE_IMAGE_INVALID",
    });
  });

  it("rejects non-image bytes even when MIME and byte count agree", async () => {
    const image = new Blob(["not an image"], { type: "image/png" });
    const { storage } = setup(
      assetFixture({ byte_size: image.size, status: "pending" }),
    );
    storage.download.mockResolvedValue({ data: image, error: null });
    await expect(verifyWorkspaceStorageAsset(assetId)).rejects.toMatchObject({
      code: "STORAGE_IMAGE_INVALID",
    });
  });
});
