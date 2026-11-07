import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { ApiError } from "@/lib/http";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
  type WorkspaceDatabase,
} from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import {
  createShareSchema,
  imageIndexSchema,
  isShareActive,
  listSharesSchema,
  projectPublicSnapshot,
  publicSnapshotSchema,
  savedLookIdSchema,
  shareTokenSchema,
  snapshotItemsSchema,
} from "./schema";

type Share = Omit<
  Database["public"]["Tables"]["share_links"]["Row"],
  "token_hash"
>;
type Asset = Database["public"]["Tables"]["assets"]["Row"];
const shareFields =
  "id,workspace_id,saved_look_id,catchphrase,public_snapshot,approved_media_ids,created_at,expires_at,revoked_at";
const unavailable = () =>
  new ApiError("SHARE_UNAVAILABLE", "This shared look is unavailable.", 404);

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function metadata(share: Share) {
  return {
    id: share.id,
    catchphrase: share.catchphrase,
    createdAt: share.created_at,
    expiresAt: share.expires_at,
    revokedAt: share.revoked_at,
    status: share.revoked_at
      ? "revoked"
      : isShareActive(share.expires_at, share.revoked_at)
        ? "active"
        : "expired",
    approvedMediaCount: share.approved_media_ids.length,
    publicSnapshot: publicSnapshotSchema.parse(share.public_snapshot),
  };
}

async function readSavedLook(context: WorkspaceDatabase, id: string) {
  const { data, error } = await context.client
    .from("saved_look_snapshots")
    .select("id,workspace_id,title,items")
    .eq("workspace_id", context.workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error)
    throw new ApiError(
      "SAVED_LOOK_READ_FAILED",
      "The saved look could not be loaded. Try again.",
      503,
      true,
    );
  if (!data || data.workspace_id !== context.workspaceId || data.id !== id)
    throw new ApiError(
      "SAVED_LOOK_NOT_FOUND",
      "The saved look is unavailable.",
      404,
    );
  return data;
}

async function activeShare(context: WorkspaceDatabase, token: string) {
  if (!shareTokenSchema.safeParse(token).success) throw unavailable();
  const { data, error } = await context.client
    .from("share_links")
    .select(shareFields)
    .eq("workspace_id", context.workspaceId)
    .eq("token_hash", hashToken(token))
    .is("revoked_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle();
  if (error)
    throw new ApiError(
      "SHARE_READ_FAILED",
      "The shared look could not be loaded. Try again.",
      503,
      true,
    );
  if (
    !data ||
    data.workspace_id !== context.workspaceId ||
    !isShareActive(data.expires_at, data.revoked_at)
  )
    throw unavailable();
  return data;
}

async function readyAssets(
  context: WorkspaceDatabase,
  ids: string[],
  buckets: string[],
) {
  const assets = new Map<string, Asset>();
  if (!ids.length) return assets;
  const { data, error } = await context.client
    .from("assets")
    .select("*")
    .eq("workspace_id", context.workspaceId)
    .eq("status", "ready")
    .in("bucket", buckets)
    .in("id", ids);
  if (error)
    throw new ApiError(
      "SHARE_IMAGE_READ_FAILED",
      "The shared images could not be loaded. Try again.",
      503,
      true,
    );
  for (const asset of data ?? []) {
    const parts = asset.storage_path.split("/");
    const file = parts[2]?.split(".");
    const extensions: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    if (
      asset.workspace_id === context.workspaceId &&
      ids.includes(asset.id) &&
      buckets.includes(asset.bucket) &&
      asset.status === "ready" &&
      !asset.deleted_at &&
      asset.byte_size > 0 &&
      asset.byte_size <= 10485760 &&
      (asset.bucket !== "previews" || asset.mime_type === "image/png") &&
      parts.length === 3 &&
      parts[0] === context.workspaceId &&
      parts[1] === asset.id &&
      file?.length === 2 &&
      savedLookIdSchema.safeParse(file[0]).success &&
      file[1] === extensions[asset.mime_type]
    )
      assets.set(asset.id, asset);
  }
  return assets;
}

async function avatarAssets(
  context: WorkspaceDatabase,
  savedLookId: string,
  ids: string[],
) {
  const media = new Map<string, Asset>();
  if (!ids.length) return media;
  const { data, error } = await context.client
    .from("saved_look_media")
    .select("id,workspace_id,saved_look_id,status,output_asset_id")
    .eq("workspace_id", context.workspaceId)
    .eq("saved_look_id", savedLookId)
    .eq("status", "succeeded")
    .in("id", ids);
  if (error)
    throw new ApiError(
      "SHARE_MEDIA_READ_FAILED",
      "The saved image status could not be loaded. Try again.",
      503,
      true,
    );
  const eligible = (data ?? []).filter(
    (row) =>
      row.workspace_id === context.workspaceId &&
      row.saved_look_id === savedLookId &&
      row.status === "succeeded" &&
      row.output_asset_id &&
      ids.includes(row.id),
  );
  const assets = await readyAssets(
    context,
    eligible.flatMap((row) =>
      row.output_asset_id ? [row.output_asset_id] : [],
    ),
    ["previews"],
  );
  for (const row of eligible) {
    const asset = row.output_asset_id
      ? assets.get(row.output_asset_id)
      : undefined;
    if (asset) media.set(row.id, asset);
  }
  return media;
}

export async function createShare(savedLookId: string, input: unknown) {
  const id = savedLookIdSchema.parse(savedLookId);
  const body = createShareSchema.parse(input);
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const saved = await readSavedLook(context, id);
  const media = await avatarAssets(context, id, body.approvedMediaIds);
  if (media.size !== body.approvedMediaIds.length)
    throw new ApiError(
      "SHARE_MEDIA_NOT_READY",
      "Choose only completed images from this saved look.",
      409,
    );
  const snapshot = projectPublicSnapshot(
    saved.title,
    saved.items,
    body.catchphrase,
  );
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const { data, error } = await context.client
    .from("share_links")
    .insert({
      workspace_id: context.workspaceId,
      saved_look_id: id,
      token_hash: hashToken(token),
      catchphrase: body.catchphrase,
      public_snapshot: snapshot,
      approved_media_ids: body.approvedMediaIds,
      created_at: now.toISOString(),
      expires_at: null,
    })
    .select(shareFields)
    .single();
  if (error || !data)
    throw new ApiError(
      "SHARE_CREATE_FAILED",
      "The link could not be created. Review the saved look and try again.",
      503,
      true,
    );
  return { ...metadata(data), token, publicPath: `/shared/${token}` };
}

export async function listShares(savedLookId: string, input: unknown) {
  const id = savedLookIdSchema.parse(savedLookId);
  const { limit, offset } = listSharesSchema.parse(input);
  const context = getWorkspaceDatabase();
  await readSavedLook(context, id);
  const { data, error } = await context.client
    .from("share_links")
    .select(shareFields)
    .eq("workspace_id", context.workspaceId)
    .eq("saved_look_id", id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error)
    throw new ApiError(
      "SHARES_READ_FAILED",
      "The share links could not be loaded. Try again.",
      503,
      true,
    );
  return { shares: (data ?? []).map(metadata), limit, offset };
}

export async function revokeShare(shareId: string) {
  const id = savedLookIdSchema.parse(shareId);
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const { data: existing, error: readError } = await context.client
    .from("share_links")
    .select(shareFields)
    .eq("workspace_id", context.workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (readError)
    throw new ApiError(
      "SHARE_READ_FAILED",
      "The share link could not be loaded. Try again.",
      503,
      true,
    );
  if (!existing || existing.workspace_id !== context.workspaceId)
    throw unavailable();
  await readSavedLook(context, existing.saved_look_id);
  if (existing.revoked_at) return metadata(existing);
  const { data, error } = await context.client
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("workspace_id", context.workspaceId)
    .eq("id", id)
    .eq("saved_look_id", existing.saved_look_id)
    .is("revoked_at", null)
    .select(shareFields)
    .maybeSingle();
  if (error)
    throw new ApiError(
      "SHARE_REVOKE_FAILED",
      "The link could not be turned off. Try again.",
      503,
      true,
    );
  if (data) return metadata(data);
  const retry = await context.client
    .from("share_links")
    .select(shareFields)
    .eq("workspace_id", context.workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (retry.error || !retry.data?.revoked_at)
    throw new ApiError(
      "SHARE_REVOKE_FAILED",
      "The link could not be turned off. Try again.",
      503,
      true,
    );
  return metadata(retry.data);
}

async function itemAssets(context: WorkspaceDatabase, savedLookId: string) {
  const saved = await readSavedLook(context, savedLookId);
  const parsed = snapshotItemsSchema.safeParse(saved.items);
  if (!parsed.success) throw unavailable();
  const assets = await readyAssets(
    context,
    parsed.data.flatMap((item) => (item.asset_id ? [item.asset_id] : [])),
    ["wardrobe", "previews"],
  );
  return parsed.data.map((item) =>
    item.asset_id ? assets.get(item.asset_id) : undefined,
  );
}

export async function readPublicShare(token: string) {
  const context = getWorkspaceDatabase();
  const share = await activeShare(context, token);
  const parsed = publicSnapshotSchema.safeParse(share.public_snapshot);
  if (!parsed.success) throw unavailable();
  const [avatars, thumbnails] = await Promise.all([
    avatarAssets(context, share.saved_look_id, share.approved_media_ids),
    itemAssets(context, share.saved_look_id),
  ]);
  const media = share.approved_media_ids.flatMap((id, index) =>
    avatars.has(id) ? [{ url: `/api/shared/${token}/media/${index}` }] : [],
  );
  return {
    ...parsed.data,
    expiresAt: share.expires_at,
    items: parsed.data.items.map((item, index) => ({
      ...item,
      imageUrl: thumbnails[index]
        ? `/api/shared/${token}/items/${index}/image`
        : null,
    })),
    media,
    mediaStatus: !share.approved_media_ids.length
      ? "not_included"
      : !media.length
        ? "unavailable"
        : media.length === share.approved_media_ids.length
          ? "ready"
          : "partial",
  };
}

async function imageResponse(
  context: WorkspaceDatabase,
  token: string,
  asset: Asset,
) {
  const { data, error } = await context.client.storage
    .from(asset.bucket)
    .download(asset.storage_path);
  if (error || !data)
    throw new ApiError(
      "SHARE_IMAGE_UNAVAILABLE",
      "This shared image is unavailable.",
      404,
    );
  if (
    data.size !== asset.byte_size ||
    data.type.split(";")[0].toLowerCase() !== asset.mime_type
  )
    throw unavailable();
  await activeShare(context, token);
  return new Response(data.stream(), {
    headers: {
      "Content-Type": asset.mime_type,
      "Content-Length": String(data.size),
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function readPublicAvatar(token: string, mediaIndex: string) {
  const parsed = imageIndexSchema.safeParse(mediaIndex);
  if (!parsed.success) throw unavailable();
  const context = getWorkspaceDatabase();
  const share = await activeShare(context, token);
  const id = share.approved_media_ids[parsed.data];
  if (!id) throw unavailable();
  const asset = (await avatarAssets(context, share.saved_look_id, [id])).get(
    id,
  );
  if (!asset) throw unavailable();
  return imageResponse(context, token, asset);
}

export async function readPublicItemImage(token: string, itemIndex: string) {
  const parsed = imageIndexSchema.safeParse(itemIndex);
  if (!parsed.success) throw unavailable();
  const context = getWorkspaceDatabase();
  const share = await activeShare(context, token);
  const manifest = publicSnapshotSchema.safeParse(share.public_snapshot);
  if (!manifest.success || !manifest.data.items[parsed.data])
    throw unavailable();
  const asset = (await itemAssets(context, share.saved_look_id))[parsed.data];
  if (!asset) throw unavailable();
  return imageResponse(context, token, asset);
}
