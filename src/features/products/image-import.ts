import "server-only";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import sharp from "sharp";
import { z } from "zod";
import { ApiError } from "@/lib/http";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
  type WorkspaceDatabase,
} from "@/lib/supabase/server";
import { STORAGE_MAX_BYTES, STORAGE_MAX_PIXELS } from "@/lib/supabase/storage";
import { categorySchema, importInputSchema } from "./schema";

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    return /^[23]/.test(lower) && !/^(2001:db8:|2001:0:|2002:)/.test(lower);
  }
  return false;
}

export function allowedProductImageUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ApiError(
      "PRODUCT_IMAGE_SOURCE_DENIED",
      "This product image cannot be imported.",
      422,
    );
  }
  const host = url.hostname.toLowerCase();
  const googleImage =
    host === "gstatic.com" ||
    host.endsWith(".gstatic.com") ||
    host === "googleusercontent.com" ||
    host.endsWith(".googleusercontent.com");
  const serpImage =
    host === "serpapi.com" && /^\/(?:images|searches)\//.test(url.pathname);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    (!googleImage && !serpImage)
  )
    throw new ApiError(
      "PRODUCT_IMAGE_SOURCE_DENIED",
      "This product image cannot be imported.",
      422,
    );
  return url;
}

async function fetchProductImage(
  input: string,
  redirects = 0,
): Promise<{
  bytes: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  extension: string;
}> {
  const url = allowedProductImageUrl(input);
  if (redirects > 3)
    throw new ApiError(
      "PRODUCT_IMAGE_REDIRECT_LIMIT",
      "The image source redirected too many times.",
      502,
      true,
    );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new ApiError(
              "PRODUCT_IMAGE_TIMEOUT",
              "The product image source timed out.",
              504,
              true,
            ),
          ),
        5000,
      );
    }),
  ]).finally(() => clearTimeout(timer));
  if (
    !addresses.length ||
    addresses.some(({ address }) => !isPublicAddress(address))
  )
    throw new ApiError(
      "PRODUCT_IMAGE_SOURCE_DENIED",
      "This product image cannot be imported.",
      422,
    );
  const address = addresses[0];
  const response = await new Promise<{
    redirect?: string;
    bytes?: Buffer;
    contentType?: string;
  }>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
        headers: {
          Accept: "image/jpeg,image/png,image/webp",
          "Accept-Encoding": "identity",
        },
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, addresses);
          else callback(null, address.address, address.family);
        },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0)) {
          res.resume();
          if (!res.headers.location)
            reject(
              new ApiError(
                "PRODUCT_IMAGE_SOURCE_FAILED",
                "The product image source is unavailable.",
                502,
                true,
              ),
            );
          else {
            try {
              resolve({ redirect: new URL(res.headers.location, url).href });
            } catch {
              reject(
                new ApiError(
                  "PRODUCT_IMAGE_SOURCE_DENIED",
                  "This product image cannot be imported.",
                  422,
                ),
              );
            }
          }
          return;
        }
        if (
          res.statusCode !== 200 ||
          Number(res.headers["content-length"]) > STORAGE_MAX_BYTES ||
          (res.headers["content-encoding"] &&
            res.headers["content-encoding"] !== "identity")
        ) {
          res.destroy();
          reject(
            new ApiError(
              "PRODUCT_IMAGE_SOURCE_FAILED",
              "The product image source is unavailable.",
              502,
              true,
            ),
          );
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > STORAGE_MAX_BYTES)
            res.destroy(new Error("Image size limit exceeded"));
          else chunks.push(chunk);
        });
        res.on("error", () =>
          reject(
            new ApiError(
              "PRODUCT_IMAGE_SOURCE_FAILED",
              "The product image could not be downloaded.",
              502,
              true,
            ),
          ),
        );
        res.on("end", () =>
          resolve({
            bytes: Buffer.concat(chunks),
            contentType: res.headers["content-type"],
          }),
        );
      },
    );
    req.on("error", () =>
      reject(
        new ApiError(
          "PRODUCT_IMAGE_SOURCE_FAILED",
          "The product image could not be downloaded.",
          502,
          true,
        ),
      ),
    );
    req.end();
  });
  if (response.redirect)
    return fetchProductImage(response.redirect, redirects + 1);
  const mimeType = response.contentType?.split(";")[0].trim().toLowerCase();
  if (
    !response.bytes?.length ||
    (mimeType !== "image/jpeg" &&
      mimeType !== "image/png" &&
      mimeType !== "image/webp")
  )
    throw new ApiError(
      "PRODUCT_IMAGE_INVALID",
      "The source did not return a supported image.",
      422,
    );
  try {
    const image = sharp(response.bytes, {
      limitInputPixels: STORAGE_MAX_PIXELS,
      failOn: "error",
      animated: false,
    }).timeout({ seconds: 5 });
    const metadata = await image.metadata();
    const expected =
      mimeType === "image/jpeg"
        ? "jpeg"
        : mimeType === "image/png"
          ? "png"
          : "webp";
    if (
      metadata.format !== expected ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > STORAGE_MAX_PIXELS ||
      (metadata.pages ?? 1) !== 1
    )
      throw new Error("Image format mismatch");
    await image.stats();
    return {
      bytes: response.bytes,
      mimeType,
      extension: expected === "jpeg" ? "jpg" : expected,
    };
  } catch {
    throw new ApiError(
      "PRODUCT_IMAGE_INVALID",
      "The source did not return a supported image.",
      422,
    );
  }
}

async function cleanupImport(
  context: WorkspaceDatabase,
  assetId: string,
  storagePath: string,
) {
  const { data: attached, error } = await context.client
    .from("wardrobe_items")
    .select("id")
    .eq("workspace_id", context.workspaceId)
    .eq("asset_id", assetId)
    .limit(1);
  if (error || attached?.length)
    throw new ApiError(
      "PRODUCT_IMPORT_RECONCILIATION_REQUIRED",
      "The image import needs to be checked before retrying.",
      503,
      true,
    );
  const { error: storageError } = await context.client.storage
    .from("wardrobe")
    .remove([storagePath]);
  const { error: assetError } = await context.client
    .from("assets")
    .update({ status: "detached" })
    .eq("workspace_id", context.workspaceId)
    .eq("id", assetId);
  if (storageError || assetError)
    throw new ApiError(
      "PRODUCT_IMPORT_CLEANUP_PENDING",
      "The image import needs cleanup before retrying.",
      503,
      true,
    );
}

type ImportOutcome = {
  itemId: string;
  inventoryStatus: string;
  importStatus: string;
  reused?: boolean;
  retryable?: boolean;
  errorCode?: string;
};

export async function importProductCandidate(
  productId: string,
  input: unknown,
  attempt = 0,
): Promise<ImportOutcome> {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const parsed = importInputSchema.safeParse(input);
  if (!parsed.success || !z.uuid().safeParse(productId).success)
    throw new ApiError(
      "PRODUCT_IMPORT_INPUT_INVALID",
      "Provide the product revision and an import key.",
    );
  const { data: product, error: productError } = await context.client
    .from("products")
    .select("*")
    .eq("workspace_id", context.workspaceId)
    .eq("id", productId)
    .maybeSingle();
  if (productError)
    throw new ApiError(
      "PRODUCT_READ_FAILED",
      "This product is unavailable.",
      503,
      true,
    );
  if (
    !product ||
    !categorySchema.safeParse(product.category).success ||
    product.provider !== "serpapi" ||
    product.source_type !== "live"
  )
    throw new ApiError(
      "PRODUCT_NOT_FOUND",
      "This product is unavailable.",
      404,
    );
  const { data: existing, error: existingError } = await context.client
    .from("wardrobe_items")
    .select("id,asset_id,source_product_id,inventory_status,revision")
    .eq("workspace_id", context.workspaceId)
    .eq("import_idempotency_key", parsed.data.idempotencyKey)
    .maybeSingle();
  if (existingError)
    throw new ApiError(
      "PRODUCT_IMPORT_READ_FAILED",
      "The import could not be checked.",
      503,
      true,
    );
  if (existing && existing.source_product_id !== product.id)
    throw new ApiError(
      "IMPORT_KEY_CONFLICT",
      "This import key belongs to another product.",
      409,
    );
  if (existing?.asset_id)
    return {
      itemId: existing.id,
      inventoryStatus: existing.inventory_status,
      importStatus: "complete",
      reused: true,
    };
  if (product.revision !== parsed.data.sourceRevision)
    throw new ApiError(
      "PRODUCT_REVISION_CONFLICT",
      "The product changed. Refresh before importing.",
      409,
    );
  let item = existing;
  if (!item) {
    const { data, error } = await context.client
      .from("wardrobe_items")
      .insert({
        workspace_id: context.workspaceId,
        name: product.title.slice(0, 160),
        category: product.category,
        subcategory: product.subcategory,
        description: product.description,
        attributes: product.attributes,
        provenance: product.provenance,
        corrections: {},
        uncertainty: product.uncertainty,
        inventory_status: "saved_candidate",
        source_type: "live",
        source_product_id: product.id,
        import_idempotency_key: parsed.data.idempotencyKey,
      })
      .select("id,asset_id,source_product_id,inventory_status,revision")
      .single();
    if (error?.code === "23505" && attempt < 1)
      return importProductCandidate(productId, input, attempt + 1);
    if (error || !data)
      throw new ApiError(
        "PRODUCT_IMPORT_SAVE_FAILED",
        "The candidate could not be saved.",
        503,
        true,
      );
    item = data;
  }
  if (!product.image_url)
    return {
      itemId: item.id,
      inventoryStatus: item.inventory_status,
      importStatus: "pending",
      retryable: true,
      errorCode: "PRODUCT_IMAGE_UNAVAILABLE",
    };
  let image: Awaited<ReturnType<typeof fetchProductImage>>;
  try {
    image = await fetchProductImage(product.image_url);
  } catch (error) {
    return {
      itemId: item.id,
      inventoryStatus: item.inventory_status,
      importStatus: "pending",
      retryable: true,
      errorCode:
        error instanceof ApiError ? error.code : "PRODUCT_IMAGE_SOURCE_FAILED",
    };
  }
  const assetId = randomUUID();
  const storagePath = `${context.workspaceId}/${assetId}/${randomUUID()}.${image.extension}`;
  const { error: assetError } = await context.client.from("assets").insert({
    id: assetId,
    workspace_id: context.workspaceId,
    bucket: "wardrobe",
    storage_path: storagePath,
    mime_type: image.mimeType,
    byte_size: image.bytes.length,
    source_type: "live",
    status: "pending",
  });
  if (assetError)
    throw new ApiError(
      "PRODUCT_IMPORT_SAVE_FAILED",
      "The image import could not be prepared.",
      503,
      true,
    );
  try {
    const { error: uploadError } = await context.client.storage
      .from("wardrobe")
      .upload(storagePath, image.bytes, {
        contentType: image.mimeType,
        upsert: false,
      });
    if (uploadError)
      throw new ApiError(
        "PRODUCT_IMAGE_SAVE_FAILED",
        "The product image could not be saved.",
        503,
        true,
      );
    const { data: current, error: currentError } = await context.client
      .from("products")
      .select("revision")
      .eq("workspace_id", context.workspaceId)
      .eq("id", product.id)
      .maybeSingle();
    if (currentError || current?.revision !== product.revision)
      throw new ApiError(
        "PRODUCT_REVISION_CONFLICT",
        "The product changed. Refresh before importing.",
        409,
      );
    const { data: ready, error: readyError } = await context.client
      .from("assets")
      .update({ status: "ready" })
      .eq("workspace_id", context.workspaceId)
      .eq("id", assetId)
      .eq("status", "pending")
      .select("id")
      .single();
    if (readyError || !ready)
      throw new ApiError(
        "PRODUCT_IMAGE_SAVE_FAILED",
        "The product image could not be saved.",
        503,
        true,
      );
    const { data: attached, error: attachError } = await context.client
      .from("wardrobe_items")
      .update({ asset_id: assetId })
      .eq("workspace_id", context.workspaceId)
      .eq("id", item.id)
      .eq("source_product_id", product.id)
      .eq("revision", item.revision)
      .is("asset_id", null)
      .select("id,inventory_status")
      .maybeSingle();
    if (attachError)
      throw new ApiError(
        "PRODUCT_IMPORT_SAVE_FAILED",
        "The image could not be attached to the candidate.",
        503,
        true,
      );
    if (!attached) {
      await cleanupImport(context, assetId, storagePath);
      const { data: winner, error } = await context.client
        .from("wardrobe_items")
        .select("id,asset_id,inventory_status")
        .eq("workspace_id", context.workspaceId)
        .eq("id", item.id)
        .eq("source_product_id", product.id)
        .maybeSingle();
      if (error || !winner?.asset_id)
        throw new ApiError(
          "PRODUCT_IMPORT_CONFLICT",
          "The candidate changed. Retry the import.",
          409,
          true,
        );
      return {
        itemId: winner.id,
        inventoryStatus: winner.inventory_status,
        importStatus: "complete",
        reused: true,
      };
    }
    return {
      itemId: attached.id,
      inventoryStatus: attached.inventory_status,
      importStatus: "complete",
      reused: false,
    };
  } catch (error) {
    await cleanupImport(context, assetId, storagePath);
    return {
      itemId: item.id,
      inventoryStatus: item.inventory_status,
      importStatus: "pending",
      retryable: true,
      errorCode:
        error instanceof ApiError ? error.code : "PRODUCT_IMPORT_SAVE_FAILED",
    };
  }
}
