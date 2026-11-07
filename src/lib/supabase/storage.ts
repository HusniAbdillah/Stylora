import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import {
  assertWorkspaceResource,
  getWorkspaceDatabase,
  requireWorkspaceWrites,
  type WorkspaceDatabase,
} from "./server";

export const STORAGE_MAX_BYTES = 10 * 1024 * 1024;
export const STORAGE_MAX_PIXELS = 16_777_216;
export const STORAGE_READ_TTL_SECONDS = 300;

const bucketSchema = z.enum(["inspiration", "wardrobe", "previews"]);
const mimeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);
const extensionByMime = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
const formatByMime = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

const uploadSchema = z
  .strictObject({
    bucket: bucketSchema,
    mimeType: mimeSchema,
    byteSize: z.number().int().min(1).max(STORAGE_MAX_BYTES),
    sourceType: z.enum(["manual", "live", "sample"]).default("manual"),
  })
  .refine(
    (input) => input.bucket !== "previews" || input.mimeType === "image/png",
  );

const assetSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  bucket: bucketSchema,
  storage_path: z.string(),
  mime_type: mimeSchema,
  byte_size: z.number().int().min(1).max(STORAGE_MAX_BYTES),
  status: z.enum(["pending", "ready", "detached", "deleted"]),
});

type StorageAsset = z.infer<typeof assetSchema>;
type StorageStatus = StorageAsset["status"];
export type StorageUploadInput = z.input<typeof uploadSchema>;

export class StorageAssetError extends Error {
  constructor(
    public readonly code:
      | "INVALID_STORAGE_UPLOAD"
      | "INVALID_STORAGE_ASSET"
      | "STORAGE_ASSET_CREATE_FAILED"
      | "STORAGE_ASSET_READ_FAILED"
      | "STORAGE_SIGN_FAILED"
      | "STORAGE_DOWNLOAD_FAILED"
      | "STORAGE_IMAGE_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "StorageAssetError";
  }
}

function invalidAsset(): never {
  throw new StorageAssetError(
    "INVALID_STORAGE_ASSET",
    "The requested image is unavailable.",
  );
}

function validateAssetPath(asset: StorageAsset, workspaceId: string) {
  const parts = asset.storage_path.split("/");
  const file = parts[2]?.split(".");
  if (
    parts.length !== 3 ||
    parts[0] !== workspaceId ||
    parts[1] !== asset.id ||
    file?.length !== 2 ||
    !z.uuid().safeParse(file[0]).success ||
    file[1] !== extensionByMime[asset.mime_type] ||
    (asset.bucket === "previews" && asset.mime_type !== "image/png")
  ) {
    invalidAsset();
  }
}

async function readAsset(
  context: WorkspaceDatabase,
  assetId: string,
  statuses: StorageStatus[],
) {
  if (!z.uuid().safeParse(assetId).success) invalidAsset();

  const { data, error } = await context.client
    .from("assets")
    .select("id,workspace_id,bucket,storage_path,mime_type,byte_size,status")
    .eq("workspace_id", context.workspaceId)
    .eq("id", assetId)
    .in("status", statuses)
    .maybeSingle();

  if (error) {
    throw new StorageAssetError(
      "STORAGE_ASSET_READ_FAILED",
      "The image could not be loaded.",
    );
  }

  const scoped = assertWorkspaceResource(data, context.workspaceId);
  const parsed = assetSchema.safeParse(scoped);
  if (
    !parsed.success ||
    parsed.data.id.toLowerCase() !== assetId.toLowerCase() ||
    !statuses.includes(parsed.data.status)
  ) {
    invalidAsset();
  }

  validateAssetPath(parsed.data, context.workspaceId);
  return parsed.data;
}

export async function createWorkspaceSignedUpload(input: StorageUploadInput) {
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) {
    throw new StorageAssetError(
      "INVALID_STORAGE_UPLOAD",
      "Choose an allowed image up to 10 MiB.",
    );
  }

  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const assetId = randomUUID();
  const storagePath = `${context.workspaceId}/${assetId}/${randomUUID()}.${extensionByMime[parsed.data.mimeType]}`;
  const { error: assetError } = await context.client.from("assets").insert({
    id: assetId,
    workspace_id: context.workspaceId,
    bucket: parsed.data.bucket,
    storage_path: storagePath,
    mime_type: parsed.data.mimeType,
    byte_size: parsed.data.byteSize,
    source_type: parsed.data.sourceType,
    status: "pending",
  });

  if (assetError) {
    throw new StorageAssetError(
      "STORAGE_ASSET_CREATE_FAILED",
      "The image upload could not be prepared.",
    );
  }

  const { data, error } = await context.client.storage
    .from(parsed.data.bucket)
    .createSignedUploadUrl(storagePath, { upsert: false });
  if (error || !data?.signedUrl || !data.token) {
    // The pending row remains available for reconciliation after a signing failure.
    throw new StorageAssetError(
      "STORAGE_SIGN_FAILED",
      "The image upload could not be prepared.",
    );
  }

  return {
    assetId,
    bucket: parsed.data.bucket,
    storagePath,
    signedUrl: data.signedUrl,
    token: data.token,
  };
}

export async function createWorkspaceSignedRead(assetId: string) {
  const context = getWorkspaceDatabase();
  const asset = await readAsset(context, assetId, ["ready"]);
  const { data, error } = await context.client.storage
    .from(asset.bucket)
    .createSignedUrl(asset.storage_path, STORAGE_READ_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new StorageAssetError(
      "STORAGE_SIGN_FAILED",
      "The image could not be displayed.",
    );
  }

  return {
    assetId: asset.id,
    signedUrl: data.signedUrl,
    expiresIn: STORAGE_READ_TTL_SECONDS,
  };
}

export async function verifyWorkspaceStorageAsset(assetId: string) {
  const context = getWorkspaceDatabase();
  const asset = await readAsset(context, assetId, ["pending", "ready"]);
  const { data, error } = await context.client.storage
    .from(asset.bucket)
    .download(asset.storage_path);
  if (error || !data) {
    throw new StorageAssetError(
      "STORAGE_DOWNLOAD_FAILED",
      "The uploaded image could not be checked.",
    );
  }

  if (
    data.size !== asset.byte_size ||
    data.size > STORAGE_MAX_BYTES ||
    data.type.split(";")[0].toLowerCase() !== asset.mime_type
  ) {
    throw new StorageAssetError(
      "STORAGE_IMAGE_INVALID",
      "The uploaded image does not match its upload details.",
    );
  }

  try {
    const image = sharp(Buffer.from(await data.arrayBuffer()), {
      failOn: "error",
      limitInputPixels: STORAGE_MAX_PIXELS,
      sequentialRead: true,
      animated: false,
    }).timeout({ seconds: 5 });
    const metadata = await image.metadata();
    if (
      metadata.format !== formatByMime[asset.mime_type] ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > STORAGE_MAX_PIXELS ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new Error("Invalid image format or dimensions");
    }
    await image.stats();

    return {
      assetId: asset.id,
      bucket: asset.bucket,
      storagePath: asset.storage_path,
      mimeType: asset.mime_type,
      byteSize: data.size,
      width: metadata.width,
      height: metadata.height,
    };
  } catch {
    throw new StorageAssetError(
      "STORAGE_IMAGE_INVALID",
      "The uploaded file is not a supported image.",
    );
  }
}
