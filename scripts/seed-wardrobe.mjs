import { createHash, randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { z } from "zod";
import { parseDatabaseConfig } from "../src/lib/config/runtime-schema.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const categories = [
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoes",
  "accessory",
];
const sharedKeys = new Set(
  "garmentForm functionalFamily constructionFamily colors primaryColor secondaryColors colorFamily colorTemperature colorValue colorChroma contrastLevel dominantHex accentHex pattern patternScale patternDensity patternDirection patternPlacement patternColors apparentMaterial texture fabricStructure surfaceFinish sheen opacity visualWeight drape visibleStretch silhouette fit volume structure length cut waistDefinition asymmetry closure closurePlacement seamDetails pleats darts panels hemShape liningVisible pockets trim embellishments hardwareColor hardwareFinish logoPresence graphicContent layeringRole layeringPosition overlapNotes styleTags formality occasion suitableOccasions season climateSuitability coverage mobilityNotes careBurden wearabilityNotes".split(
    " ",
  ),
);
const upperKeys =
  "neckline collar lapel sleeve sleeveShape cuff shoulderConstruction bodiceShape backDetail strapWidth";
const lowerKeys =
  "rise waistband legShape inseamLengthClass skirtShape slitPlacement slitHeightClass frontConstruction crotchConstruction";
const categoryKeys = {
  top: upperKeys,
  bottom: lowerKeys,
  dress: `${upperKeys} ${lowerKeys}`,
  outerwear:
    "lapel fasteningStyle insulationAppearance hood vent belted weatherFeatures",
  shoes:
    "shoeType toeShape heelType heelHeightClass soleType shaftHeight fasteningStyle upperAppearance activitySpecialization",
  accessory:
    "bagType bagScale carryMode strapType handleType compartmentsVisible accessoryType metalAppearance stoneAppearance scale motif placement shape brim wrapStyle lengthClass edgeFinish widthClass buckleShape",
};
const jsonObject = z.record(z.string(), z.unknown());
const entrySchema = z
  .object({
    id: z.string().min(1).max(120),
    name: z.string().trim().min(1).max(160),
    category: z.enum(categories),
    subcategory: z.string().max(120),
    color: z.string().max(80),
    notes: z.string().max(600),
    attributes: z.record(
      z.string(),
      z.union([z.string().max(120), z.array(z.string().max(40)).max(8)]),
    ),
    imageName: z.string().regex(/^[a-zA-Z0-9_.-]+\.webp$/),
    sourceType: z.literal("sample"),
    inventoryStatus: z.literal("owned"),
    annotation: z
      .object({
        fashionSchemaVersion: z.literal("fashion-item.v1"),
        provenance: z.record(
          z.string(),
          z
            .object({
              source: z.enum([
                "user",
                "visual_inference",
                "catalog",
                "derived",
                "sample",
              ]),
              state: z.enum([
                "observed",
                "reported",
                "inferred",
                "not_visible",
                "not_applicable",
                "unknown",
              ]),
              confidence: z.number().min(0).max(1).nullable(),
              evidence: z.string().min(1),
            })
            .passthrough(),
        ),
        corrections: jsonObject,
        confidence: z.number().min(0).max(1).nullable(),
        uncertainty: z.array(z.string()),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        imageSha256: z.string().regex(/^[a-f0-9]{64}$/),
        sourceMetadata: jsonObject,
      })
      .passthrough(),
  })
  .passthrough();

class SeedError extends Error {}

function requireCheck(condition, code) {
  if (!condition) throw new SeedError(code);
}

export function seedIdentity(workspaceId, entryId) {
  const key = `wardrobe-starter.v1:${entryId}`;
  const uuid = (kind) => {
    const bytes = createHash("sha256")
      .update(`${workspaceId}:${key}:${kind}`)
      .digest();
    bytes[6] = (bytes[6] & 15) | 128;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = bytes.subarray(0, 16).toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  return { key, itemId: uuid("item"), assetId: uuid("asset") };
}

export function validateManifest(input) {
  const parsed = z
    .object({
      datasetType: z.literal("starter_wardrobe"),
      itemCount: z.number().int().positive(),
      imageBase: z.string().min(1),
      items: z.array(entrySchema).min(1).max(100),
    })
    .parse(input);
  requireCheck(
    parsed.itemCount === parsed.items.length,
    "DATASET_COUNT_MISMATCH",
  );
  requireCheck(
    new Set(parsed.items.map((item) => item.id)).size === parsed.itemCount,
    "DUPLICATE_SEED_KEY",
  );
  requireCheck(
    new Set(parsed.items.map((item) => item.imageName)).size ===
      parsed.itemCount,
    "DUPLICATE_IMAGE",
  );
  for (const item of parsed.items) {
    requireCheck(
      Buffer.byteLength(JSON.stringify(item.attributes)) <= 7500,
      "ATTRIBUTES_TOO_LARGE",
    );
    requireCheck(
      item.attributes.primaryColor === item.color,
      "PRIMARY_COLOR_MISMATCH",
    );
    requireCheck(
      Object.keys(item.attributes).every(
        (key) => item.annotation.provenance[`attributes.${key}`],
      ),
      "ATTRIBUTE_EVIDENCE_MISSING",
    );
    const applicable = new Set(categoryKeys[item.category].split(" "));
    requireCheck(
      Object.keys(item.attributes).every(
        (key) => sharedKeys.has(key) || applicable.has(key),
      ),
      "ATTRIBUTE_NOT_APPLICABLE",
    );
    requireCheck(
      !item.attributes.colors || item.attributes.colors.length <= 5,
      "TOO_MANY_COLORS",
    );
    requireCheck(
      Buffer.byteLength(JSON.stringify(item.annotation.corrections)) <= 30000 &&
        Buffer.byteLength(JSON.stringify(item.annotation.uncertainty)) <= 7500,
      "ANNOTATION_TOO_LARGE",
    );
  }
  return parsed;
}

async function readDataset(manifestPath) {
  const manifest = validateManifest(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
  const directory = await realpath(dirname(manifestPath));
  const images = await realpath(resolve(directory, manifest.imageBase));
  requireCheck(
    images === directory || images.startsWith(directory + sep),
    "IMAGE_DIRECTORY_OUTSIDE_DATASET",
  );
  const entries = [];
  for (const item of manifest.items) {
    const filename = await realpath(resolve(images, item.imageName));
    requireCheck(filename.startsWith(images + sep), "IMAGE_OUTSIDE_DATASET");
    const bytes = await readFile(filename);
    requireCheck(
      bytes.length > 0 && bytes.length <= 10 * 1024 * 1024,
      "IMAGE_SIZE_INVALID",
    );
    requireCheck(
      hash(bytes) === item.annotation.imageSha256,
      "IMAGE_HASH_MISMATCH",
    );
    const decoder = sharp(bytes, { limitInputPixels: 40_000_000 });
    const metadata = await decoder.metadata();
    requireCheck(
      metadata.format === "webp" &&
        metadata.width === item.annotation.width &&
        metadata.height === item.annotation.height,
      "IMAGE_METADATA_MISMATCH",
    );
    await decoder.stats();
    entries.push({ item, bytes });
  }
  return entries;
}

async function lookup(client, table, workspaceId, field, value) {
  const response = await client
    .from(table)
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq(field, value)
    .maybeSingle();
  requireCheck(!response.error, `${table.toUpperCase()}_READ_FAILED`);
  return response.data;
}

async function verifyAsset(client, workspaceId, asset, bytes) {
  requireCheck(
    asset?.workspace_id === workspaceId &&
      asset.bucket === "wardrobe" &&
      asset.storage_path.startsWith(workspaceId + "/"),
    "ASSET_SCOPE_INVALID",
  );
  const response = await client.storage
    .from("wardrobe")
    .download(asset.storage_path);
  requireCheck(!response.error && response.data, "STORAGE_DOWNLOAD_FAILED");
  const stored = Buffer.from(await response.data.arrayBuffer());
  requireCheck(
    asset.mime_type === "image/webp" && stored.length === asset.byte_size,
    "STORED_IMAGE_METADATA_INVALID",
  );
  requireCheck(hash(stored) === hash(bytes), "STORED_IMAGE_HASH_MISMATCH");
}

async function prepareAsset(client, workspaceId, identity, bytes) {
  const pending = {
    id: identity.assetId,
    workspace_id: workspaceId,
    bucket: "wardrobe",
    storage_path: `${workspaceId}/${identity.assetId}/${randomUUID()}.webp`,
    mime_type: "image/webp",
    byte_size: bytes.length,
    source_type: "sample",
    status: "pending",
  };
  const inserted = await client
    .from("assets")
    .upsert(pending, { onConflict: "id", ignoreDuplicates: true });
  requireCheck(!inserted.error, "ASSET_ALLOCATION_FAILED");
  const asset = await lookup(
    client,
    "assets",
    workspaceId,
    "id",
    identity.assetId,
  );
  requireCheck(
    asset && ["pending", "ready"].includes(asset.status),
    "SEED_ASSET_UNAVAILABLE",
  );
  requireCheck(
    asset.workspace_id === workspaceId &&
      asset.bucket === "wardrobe" &&
      asset.storage_path.startsWith(workspaceId + "/"),
    "ASSET_SCOPE_INVALID",
  );
  if (asset.status === "pending") {
    const uploaded = await client.storage
      .from("wardrobe")
      .upload(asset.storage_path, bytes, {
        contentType: "image/webp",
        upsert: false,
      });
    if (uploaded.error) {
      // A retry may find an object uploaded before the previous request failed.
      await verifyAsset(client, workspaceId, asset, bytes);
    }
  }
  await verifyAsset(client, workspaceId, asset, bytes);
  if (asset.status === "pending") {
    const ready = await client
      .from("assets")
      .update({ status: "ready" })
      .eq("workspace_id", workspaceId)
      .eq("id", asset.id)
      .eq("status", "pending");
    requireCheck(!ready.error, "ASSET_FINALIZE_FAILED");
  }
  const finalized = await lookup(client, "assets", workspaceId, "id", asset.id);
  requireCheck(finalized?.status === "ready", "ASSET_FINALIZE_CONFLICT");
  return asset.id;
}

function itemRow(item, workspaceId, identity) {
  const provenance = structuredClone(item.annotation.provenance);
  provenance.description = provenance.notes;
  delete provenance.notes;
  for (const entry of Object.values(provenance))
    entry.assetId = identity.assetId;
  requireCheck(
    Buffer.byteLength(JSON.stringify(provenance)) <= 30000,
    "PROVENANCE_TOO_LARGE",
  );
  return {
    id: identity.itemId,
    workspace_id: workspaceId,
    name: item.name,
    category: item.category,
    subcategory: item.subcategory,
    color: item.color,
    description: item.notes,
    notes: "",
    attributes: item.attributes,
    inferred_attributes: item.attributes,
    provenance,
    corrections: item.annotation.corrections,
    uncertainty: item.annotation.uncertainty,
    confidence: item.annotation.confidence,
    asset_id: identity.assetId,
    import_idempotency_key: identity.key,
    inventory_status: "owned",
    source_type: "sample",
  };
}

async function seedEntry(client, config, entry, mode) {
  const { item, bytes } = entry;
  const identity = seedIdentity(config.workspaceId, item.id);
  const existing = await lookup(
    client,
    "wardrobe_items",
    config.workspaceId,
    "import_idempotency_key",
    identity.key,
  );
  if (existing) {
    requireCheck(existing.asset_id, "EXISTING_ITEM_ASSET_MISSING");
    const asset = await lookup(
      client,
      "assets",
      config.workspaceId,
      "id",
      existing.asset_id,
    );
    requireCheck(
      asset?.status === "ready" &&
        asset.bucket === "wardrobe" &&
        asset.storage_path.startsWith(config.workspaceId + "/"),
      "EXISTING_ITEM_ASSET_UNAVAILABLE",
    );
    if (existing.asset_id === identity.assetId)
      await verifyAsset(client, config.workspaceId, asset, bytes);
    return "preserved";
  }
  requireCheck(mode !== "verify", "SEED_ITEM_MISSING");
  itemRow(item, config.workspaceId, identity);
  if (mode === "dry-run") return "planned";
  await prepareAsset(client, config.workspaceId, identity, bytes);
  const inserted = await client
    .from("wardrobe_items")
    .upsert(itemRow(item, config.workspaceId, identity), {
      onConflict: "workspace_id,import_idempotency_key",
      ignoreDuplicates: true,
    });
  requireCheck(!inserted.error, "WARDROBE_INSERT_FAILED");
  const saved = await lookup(
    client,
    "wardrobe_items",
    config.workspaceId,
    "import_idempotency_key",
    identity.key,
  );
  requireCheck(
    saved?.asset_id && saved.workspace_id === config.workspaceId,
    "WARDROBE_COMMIT_UNVERIFIED",
  );
  return "created";
}

async function main() {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean" },
      apply: { type: "boolean" },
      verify: { type: "boolean" },
      "expected-workspace": { type: "string" },
      manifest: { type: "string" },
    },
  });
  const modes = ["dry-run", "apply", "verify"].filter((mode) => values[mode]);
  requireCheck(modes.length === 1, "CHOOSE_DRY_RUN_APPLY_OR_VERIFY");
  const mode = modes[0];
  const entries = await readDataset(
    resolve(root, values.manifest ?? "data/wardrobe/wardrobe.json"),
  );
  const config = parseDatabaseConfig(process.env);
  requireCheck(
    config && values["expected-workspace"],
    "WORKSPACE_CONFIGURATION_UNAVAILABLE",
  );
  requireCheck(
    mode !== "apply" || config.writesEnabled,
    "WORKSPACE_WRITES_DISABLED",
  );
  for (const { item } of entries)
    itemRow(
      item,
      config.workspaceId,
      seedIdentity(config.workspaceId, item.id),
    );
  const client = createClient(config.url, config.secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, options = {}) =>
        fetch(input, {
          ...options,
          signal: options.signal
            ? AbortSignal.any([options.signal, AbortSignal.timeout(20_000)])
            : AbortSignal.timeout(20_000),
        }),
    },
  });
  const workspace = await client
    .from("workspaces")
    .select("id,name")
    .eq("id", config.workspaceId)
    .maybeSingle();
  requireCheck(
    !workspace.error && workspace.data?.name === values["expected-workspace"],
    "WORKSPACE_TARGET_MISMATCH",
  );
  const bucket = await client.storage.getBucket("wardrobe");
  requireCheck(
    !bucket.error &&
      bucket.data?.public === false &&
      bucket.data.allowed_mime_types?.includes("image/webp") &&
      Number(bucket.data.file_size_limit) === 10 * 1024 * 1024,
    "WARDROBE_BUCKET_INVALID",
  );
  console.log(
    `Validated ${entries.length} images; target ${workspace.data.name}; mode ${mode}.`,
  );
  const counts = { created: 0, preserved: 0, planned: 0, failed: 0 };
  let next = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < entries.length) {
        const position = next++;
        try {
          counts[await seedEntry(client, config, entries[position], mode)]++;
        } catch (error) {
          counts.failed++;
          console.error(
            `Item ${position + 1}: ${error instanceof SeedError ? error.message : "SEED_OPERATION_FAILED"}`,
          );
        }
      }
    }),
  );
  console.log(JSON.stringify(counts));
  requireCheck(counts.failed === 0, "SEED_INCOMPLETE_RERUN_TO_RESUME");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    console.error(
      error instanceof SeedError
        ? error.message
        : "SEED_VALIDATION_OR_CONNECTION_FAILED",
    );
    process.exitCode = 1;
  }
}
