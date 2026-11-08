import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { StorageApiError } from "@supabase/supabase-js";
import { apiRoute } from "@/lib/api";
import { getWorkspaceDatabase, type WorkspaceDatabase } from "./server";
import {
  createWorkspaceSignedRead,
  createWorkspaceSignedReads,
  createWorkspaceSignedUpload,
  STORAGE_MAX_BYTES,
  STORAGE_READ_TTL_SECONDS,
  StorageAssetError,
  type StorageUploadInput,
  verifyWorkspaceStorageAsset,
  readVerifiedWorkspaceStorageAsset,
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
    abortSignal: vi.fn().mockReturnThis(),
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
  it("returns the exact verified bytes from one download and preserves the caller deadline", async () => {
    const image = await pngFixture();
    const { query, storage } = setup(assetFixture({ byte_size: image.size }));
    storage.download.mockResolvedValue({ data: image, error: null });
    const signal = AbortSignal.timeout(5000);
    const result = await readVerifiedWorkspaceStorageAsset(assetId, {
      signal,
      readyOnly: true,
    });
    expect(result.bytes).toEqual(new Uint8Array(await image.arrayBuffer()));
    expect(result).toMatchObject({
      width: 2,
      height: 3,
      byteSize: image.size,
      mimeType: "image/png",
    });
    expect(query.in).toHaveBeenCalledWith("status", ["ready"]);
    expect(query.abortSignal).toHaveBeenCalledWith(signal);
    expect(storage.download).toHaveBeenCalledExactlyOnceWith(
      assetFixture().storage_path,
      undefined,
      { signal },
    );
  });

  it("keeps verified bytes out of the public upload verification result", async () => {
    const image = await pngFixture();
    const { storage } = setup(
      assetFixture({ byte_size: image.size, status: "pending" }),
    );
    storage.download.mockResolvedValue({ data: image, error: null });
    const result = await verifyWorkspaceStorageAsset(assetId);
    expect(Object.keys(result).sort()).toEqual(
      [
        "assetId",
        "bucket",
        "storagePath",
        "mimeType",
        "byteSize",
        "width",
        "height",
      ].sort(),
    );
    expect(storage.download).toHaveBeenCalledOnce();
  });

  it("rejects an expired deadline before any asset lookup or byte download", async () => {
    const { client, storage } = setup();
    const reason = new Error("Caller deadline expired");
    await expect(
      readVerifiedWorkspaceStorageAsset(assetId, {
        signal: AbortSignal.abort(reason),
      }),
    ).rejects.toBe(reason);
    expect(client.from).not.toHaveBeenCalled();
    expect(storage.download).not.toHaveBeenCalled();
  });

  it("rejects a pending reference before download when ready bytes are required", async () => {
    const { storage } = setup(assetFixture({ status: "pending" }));
    await expect(
      readVerifiedWorkspaceStorageAsset(assetId, { readyOnly: true }),
    ).rejects.toMatchObject({ code: "INVALID_STORAGE_ASSET" });
    expect(storage.download).not.toHaveBeenCalled();
  });

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

describe("createWorkspaceSignedReads", () => {
  const otherId = "0d7c6f24-1111-4a52-9f5e-3b3c2c9f1a10";
  function bulkSetup(
    signed: { path: string; signedUrl: string | null; error: unknown }[],
  ) {
    const rows = [
      assetFixture(),
      assetFixture({
        id: otherId,
        storage_path: `${workspaceId}/${otherId}/${objectId}.png`,
      }),
    ];
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
    const storage = {
      createSignedUrls: vi
        .fn()
        .mockResolvedValue({ data: signed, error: null }),
    };
    const client = {
      from: vi.fn().mockReturnValue(query),
      storage: { from: vi.fn().mockReturnValue(storage) },
    };
    vi.mocked(getWorkspaceDatabase).mockReturnValue({
      client,
      workspaceId,
      writesEnabled: true,
    } as unknown as WorkspaceDatabase);
    return { rows, query, storage, client };
  }

  it("signs every ready asset in one scoped lookup and one signing call", async () => {
    const { rows, query, storage } = bulkSetup([]);
    storage.createSignedUrls.mockResolvedValue({
      data: rows.map((row) => ({
        path: row.storage_path,
        signedUrl: `https://example.supabase.co/${row.id}`,
        error: null,
      })),
      error: null,
    });
    const urls = await createWorkspaceSignedReads([assetId, otherId, assetId]);
    expect(urls.get(assetId)).toBe(`https://example.supabase.co/${assetId}`);
    expect(urls.get(otherId)).toBe(`https://example.supabase.co/${otherId}`);
    expect(query.eq).toHaveBeenCalledWith("workspace_id", workspaceId);
    expect(query.eq).toHaveBeenCalledWith("status", "ready");
    expect(query.in).toHaveBeenCalledTimes(1);
    expect(storage.createSignedUrls).toHaveBeenCalledTimes(1);
    expect(storage.createSignedUrls).toHaveBeenCalledWith(
      rows.map((row) => row.storage_path),
      STORAGE_READ_TTL_SECONDS,
    );
  });

  it("leaves out assets that fail to sign and ignores invalid ids", async () => {
    const { rows } = bulkSetup([]);
    bulkSetup([
      {
        path: rows[0].storage_path,
        signedUrl: null,
        error: { message: "unavailable" },
      },
      {
        path: rows[1].storage_path,
        signedUrl: "https://example.supabase.co/ok",
        error: null,
      },
    ]);
    const urls = await createWorkspaceSignedReads([
      assetId,
      otherId,
      "not-a-uuid",
    ]);
    expect(urls.has(assetId)).toBe(false);
    expect(urls.get(otherId)).toBe("https://example.supabase.co/ok");
  });

  it("skips the database when no valid ids are supplied", async () => {
    const { client } = bulkSetup([]);
    expect((await createWorkspaceSignedReads(["bad"])).size).toBe(0);
    expect(client.from).not.toHaveBeenCalled();
  });

  it.each([
    { workspace_id: foreignWorkspaceId },
    { status: "pending" },
    { bucket: "public" },
    { storage_path: `${foreignWorkspaceId}/${assetId}/${objectId}.png` },
    { storage_path: `${workspaceId}/${assetId}/../${objectId}.png` },
    { storage_path: `${workspaceId}/${assetId}/${objectId}.jpg` },
    { bucket: "previews", mime_type: "image/jpeg" },
    { byte_size: STORAGE_MAX_BYTES + 1 },
    { id: "8028ac62-eae5-4f8e-8b32-46f7cb6b1e0b" },
  ])(
    "never signs invalid or unrequested asset metadata %j",
    async (overrides) => {
      const { rows, storage } = bulkSetup([]);
      rows[0] = assetFixture(overrides);
      await createWorkspaceSignedReads([assetId, otherId]);
      expect(storage.createSignedUrls).toHaveBeenCalledWith(
        [rows[1].storage_path],
        STORAGE_READ_TTL_SECONDS,
      );
    },
  );

  it("ignores signed paths outside the validated batch", async () => {
    const { rows, storage } = bulkSetup([]);
    storage.createSignedUrls.mockResolvedValue({
      data: [
        {
          path: `${foreignWorkspaceId}/${assetId}/${objectId}.png`,
          signedUrl: "https://example.supabase.co/foreign",
          error: null,
        },
        {
          path: rows[1].storage_path,
          signedUrl: "https://example.supabase.co/valid",
          error: null,
        },
      ],
      error: null,
    });
    const urls = await createWorkspaceSignedReads([assetId, otherId]);
    expect([...urls.keys()]).toEqual([otherId]);
  });

  it("preserves available images when one bucket fails to sign", async () => {
    const { rows, storage } = bulkSetup([]);
    rows[1] = assetFixture({
      id: otherId,
      bucket: "previews",
      storage_path: `${workspaceId}/${otherId}/${objectId}.png`,
    });
    storage.createSignedUrls
      .mockResolvedValueOnce({
        data: null,
        error: new StorageApiError("unavailable", 503, "503"),
      })
      .mockResolvedValueOnce({
        data: [
          {
            path: rows[1].storage_path,
            signedUrl: "https://example.supabase.co/valid",
            error: null,
          },
        ],
        error: null,
      });
    const urls = await createWorkspaceSignedReads([assetId, otherId]);
    expect([...urls.keys()]).toEqual([otherId]);
  });

  it("bounds metadata and signing batches for larger inventories", async () => {
    const { query, storage } = bulkSetup([]);
    const rows = Array.from({ length: 101 }, (_, index) => {
      const id = `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
      return assetFixture({
        id,
        storage_path: `${workspaceId}/${id}/${objectId}.png`,
      });
    });
    query.in.mockImplementation(async (_field, ids) => ({
      data: rows.filter((row) => ids.includes(row.id)),
      error: null,
    }));
    storage.createSignedUrls.mockImplementation(async (paths) => ({
      data: paths.map((path: string) => ({
        path,
        signedUrl: "https://example.supabase.co/valid",
        error: null,
      })),
      error: null,
    }));
    const urls = await createWorkspaceSignedReads(rows.map((row) => row.id));
    expect(urls.size).toBe(101);
    expect(query.in.mock.calls.map((call) => call[1].length)).toEqual([100, 1]);
    expect(storage.createSignedUrls).toHaveBeenCalledTimes(2);
  });
});
