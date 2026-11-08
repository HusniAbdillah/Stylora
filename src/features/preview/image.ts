import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { attributesSchema, categorySchema } from "@/lib/ai/fashion-schema";
import { resolveEffectiveAttributes } from "@/features/matching/gates";
import {
  generateFashionImage,
  IMAGE_MODEL,
  AVATAR_PROMPT_VERSION as FASHION_PROMPT_VERSION,
  FASHION_SCHEMA_VERSION,
  FASHION_KNOWLEDGE_VERSION,
} from "@/features/ai/openai";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
} from "@/lib/supabase/server";
import {
  createWorkspaceSignedUpload,
  verifyWorkspaceStorageAsset,
  readVerifiedWorkspaceStorageAsset,
} from "@/lib/supabase/storage";
import { prepareReferenceImage } from "@/features/ai/reference-image";
import { avatarIoError } from "./image-errors";
import { OperationError } from "@/features/operations/errors";
import { buildAvatarVisualDirection } from "./visual-direction";
import {
  getImageRenderSettings,
  imageRenderSettingsSchema,
  type ImageRenderSettings,
} from "@/features/ai/image-settings";

export { getImageRenderSettings as getAvatarRenderSettings } from "@/features/ai/image-settings";

export const avatarItemSchema = z.object({
  id: z.uuid().nullable(),
  name: z.string().min(1).max(160),
  category: categorySchema,
  subcategory: z.string().nullable(),
  description: z.string().max(600),
  attributes: attributesSchema,
  revision: z.number().int().positive(),
  asset_id: z.uuid().nullable(),
});

export type AvatarItem = z.infer<typeof avatarItemSchema>;
export function normalizeAvatarItems(input: unknown[]) {
  const captured = z
    .array(
      z
        .object({
          attributes: z.record(z.string(), z.unknown()),
          inferred_attributes: z.record(z.string(), z.unknown()).optional(),
          corrections: z.record(z.string(), z.unknown()).optional(),
          provenance: z.record(z.string(), z.unknown()).optional(),
        })
        .passthrough(),
    )
    .min(1)
    .max(20)
    .parse(input);
  return captured.map((item) =>
    avatarItemSchema.parse({
      ...item,
      attributes: resolveEffectiveAttributes({
        attributes: item.attributes,
        inferredAttributes: item.inferred_attributes,
        corrections: item.corrections,
        provenance: item.provenance,
      }),
    }),
  );
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function avatarRenderFingerprint(
  items: AvatarItem[],
  preferences: unknown,
  renderSettings: ImageRenderSettings = getImageRenderSettings(),
) {
  return createHash("sha256")
    .update(
      stableJson({
        items: [...items].sort((left, right) =>
          (left.id ?? stableJson(left)).localeCompare(
            right.id ?? stableJson(right),
          ),
        ),
        visualDirection: buildAvatarVisualDirection(preferences, items),
        model: IMAGE_MODEL,
        promptVersion: FASHION_PROMPT_VERSION,
        schemaVersion: FASHION_SCHEMA_VERSION,
        knowledgeVersion: FASHION_KNOWLEDGE_VERSION,
        renderSettings: imageRenderSettingsSchema.parse(renderSettings),
      }),
    )
    .digest("hex");
}

export async function restoreAvatarCheckpoint(
  result: unknown,
  expectedFingerprint: string,
  signal: AbortSignal,
  metadata: unknown = {},
) {
  const parsed = z
    .strictObject({
      assetId: z.uuid(),
      renderFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .safeParse(result);
  if (!parsed.success || !z.strictObject({}).safeParse(metadata).success)
    throw new OperationError(
      "AVATAR_CHECKPOINT_UNUSABLE",
      "The saved image result is invalid. Request a new image.",
      409,
    );
  if (parsed.data.renderFingerprint !== expectedFingerprint)
    throw new OperationError(
      "INPUT_SUPERSEDED",
      "The image inputs changed.",
      409,
    );
  try {
    const verified = await readVerifiedWorkspaceStorageAsset(
      parsed.data.assetId,
      { signal },
    );
    if (verified.bucket !== "previews" || verified.mimeType !== "image/png")
      throw new OperationError(
        "AVATAR_CHECKPOINT_UNUSABLE",
        "The saved image result is unavailable.",
        409,
      );
  } catch (failure) {
    if (failure instanceof OperationError) throw failure;
    const error = avatarIoError(failure, "AVATAR_CHECKPOINT_UNUSABLE");
    if (error.retryable) throw error;
    throw new OperationError(
      "AVATAR_CHECKPOINT_UNUSABLE",
      "The saved image result is unavailable. Request a new image.",
      409,
    );
  }
  return { ...parsed.data, createdAsset: false };
}

export async function renderAndStoreAvatar(input: {
  items: unknown[];
  preferences: unknown;
  allowIllustrativeItems?: boolean;
  reuse?: boolean;
  signal?: AbortSignal;
  renderSettings?: ImageRenderSettings;
  beforeGenerate?: () => Promise<void>;
  afterGenerate?: () => Promise<void>;
}) {
  const items = normalizeAvatarItems(input.items);
  const renderSettings = imageRenderSettingsSchema.parse(
    input.renderSettings ?? getImageRenderSettings(),
  );
  const visualDirection = buildAvatarVisualDirection(input.preferences, items);
  if (items.filter((item) => item.asset_id).length > 16)
    throw new Error("AVATAR_IMAGE_REFERENCE_LIMIT");
  const knownIds = items.map((item) => item.id).filter((id) => id !== null);
  if (new Set(knownIds).size !== knownIds.length)
    throw new Error("AVATAR_DUPLICATE_ITEM");
  if (
    !input.allowIllustrativeItems &&
    items.some((item) => !item.id || !item.asset_id)
  )
    throw new Error("AVATAR_IMAGE_UNAVAILABLE");
  const context = getWorkspaceDatabase();
  const { client, workspaceId } = context;
  requireWorkspaceWrites(context);
  const renderFingerprint = avatarRenderFingerprint(
    items,
    input.preferences,
    renderSettings,
  );
  const {
    data: prior,
    error: reuseError,
    status: reuseStatus,
  } = await client
    .from("workflow_operations")
    .select("result_ref")
    .eq("workspace_id", workspaceId)
    .in("kind", ["preview_image", "saved_avatar"])
    .eq("status", "succeeded")
    .contains("result_ref", { renderFingerprint })
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (reuseError)
    throw avatarIoError(reuseError, "AVATAR_REUSE_LOOKUP_FAILED", reuseStatus);
  if (prior && input.reuse !== false) {
    const reference = z.object({ assetId: z.uuid() }).parse(prior.result_ref);
    const {
      data: existing,
      error,
      status,
    } = await client
      .from("assets")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("id", reference.assetId)
      .eq("bucket", "previews")
      .eq("status", "ready")
      .maybeSingle();
    if (error) throw avatarIoError(error, "AVATAR_REUSE_LOOKUP_FAILED", status);
    if (existing)
      return { assetId: existing.id, renderFingerprint, createdAsset: false };
  }
  // Load every reference at once: each lookup, verification and download is
  // independent, and the sequential version added one round trip per garment.
  const loaded = await Promise.all(
    items.map(async (item) => {
      if (!item.asset_id) {
        if (!input.allowIllustrativeItems)
          throw new Error("AVATAR_IMAGE_UNAVAILABLE");
        return null;
      }
      const verified = await readVerifiedWorkspaceStorageAsset(item.asset_id, {
        signal: input.signal,
        readyOnly: true,
      }).catch((failure: unknown) => {
        throw avatarIoError(failure, "AVATAR_IMAGE_UNAVAILABLE");
      });
      const bytes = verified.bytes;
      // A smaller reference uploads and processes faster. If it cannot be
      // decoded here, send the verified original unchanged.
      return prepareReferenceImage(bytes).catch(() => ({
        bytes,
        mimeType: verified.mimeType,
      }));
    }),
  );
  const images = loaded.filter((image) => image !== null);
  await input.beforeGenerate?.();
  const generated = await generateFashionImage({
    items: items.map((item) => ({
      ...item,
      uncertainty: item.asset_id
        ? []
        : [
            "Rendered from a saved description without a verified garment photograph.",
          ],
    })),
    visualDirection,
    images,
    signal: input.signal,
    allowDescriptionOnly: input.allowIllustrativeItems,
    renderSettings,
  }).finally(async () => {
    try {
      await input.afterGenerate?.();
    } catch {
      console.warn(JSON.stringify({ event: "avatar_provider_release_failed" }));
    }
  });
  const asset = await createWorkspaceSignedUpload({
    bucket: "previews",
    mimeType: "image/png",
    byteSize: generated.bytes.byteLength,
    sourceType: "live",
  }).catch((failure: unknown) => {
    throw avatarIoError(failure, "AVATAR_IMAGE_UPLOAD_FAILED");
  });
  try {
    const { error } = await client.storage
      .from("previews")
      .upload(asset.storagePath, generated.bytes, {
        contentType: "image/png",
        upsert: false,
      });
    if (error) throw avatarIoError(error, "AVATAR_IMAGE_UPLOAD_FAILED");
    await verifyWorkspaceStorageAsset(asset.assetId).catch(
      (failure: unknown) => {
        throw avatarIoError(failure, "AVATAR_IMAGE_UPLOAD_FAILED");
      },
    );
    input.signal?.throwIfAborted();
    return { assetId: asset.assetId, renderFingerprint, createdAsset: true };
  } catch (error) {
    await discardPendingAvatar(asset.assetId);
    throw error;
  }
}

export async function discardPendingAvatar(assetId: string) {
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data } = await client
    .from("assets")
    .update({ status: "detached" })
    .eq("workspace_id", workspaceId)
    .eq("id", assetId)
    .eq("bucket", "previews")
    .eq("status", "pending")
    .select("storage_path")
    .maybeSingle();
  if (!data) return;
  const { error } = await client.storage
    .from("previews")
    .remove([data.storage_path]);
  if (!error)
    await client
      .from("assets")
      .update({ status: "deleted" })
      .eq("workspace_id", workspaceId)
      .eq("id", assetId)
      .eq("status", "detached");
}
