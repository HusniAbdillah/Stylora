import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";

const buckets = ["inspiration", "wardrobe", "previews"];
const allowedMimeTypes = {
  inspiration: ["image/jpeg", "image/png", "image/webp"],
  wardrobe: ["image/jpeg", "image/png", "image/webp"],
  previews: ["image/png"],
};
const maxBytes = 10 * 1024 * 1024;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lwAAAABJRU5ErkJggg==",
  "base64",
);

class VerificationError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function requireCheck(condition, code) {
  if (!condition) throw new VerificationError(code);
}

function isMissingObject(error) {
  const status = Number(error?.status ?? error?.statusCode);
  return (
    status === 404 ||
    (status === 400 &&
      /(?:object|resource) not found/i.test(error?.message ?? ""))
  );
}

async function readConfiguration() {
  let local = {};
  try {
    local = parseEnv(
      await readFile(
        fileURLToPath(new URL("../.env.local", import.meta.url)),
        "utf8",
      ),
    );
  } catch (error) {
    if (error?.code !== "ENOENT")
      throw new VerificationError("ENV_FILE_UNAVAILABLE");
  }

  const env = { ...local, ...process.env };
  const workspaceId = env.STYLORA_WORKSPACE_ID;
  const secretKey = env.SUPABASE_SECRET_KEY;
  let url;
  try {
    url = new URL(env.SUPABASE_URL);
  } catch {
    throw new VerificationError("WORKSPACE_CONFIGURATION_UNAVAILABLE");
  }

  requireCheck(
    url.protocol === "https:" &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password &&
      /^sb_secret_[a-zA-Z0-9_-]+$/.test(secretKey ?? "") &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        workspaceId ?? "",
      ) &&
      [undefined, "true", "false"].includes(env.DEMO_WRITES_ENABLED),
    "WORKSPACE_CONFIGURATION_UNAVAILABLE",
  );

  return {
    url: url.origin,
    secretKey,
    workspaceId,
    writesEnabled: env.DEMO_WRITES_ENABLED === "true",
  };
}

async function verifyStorageRoundTrip(client, workspaceId, bucketMetadata) {
  const runId = randomUUID();
  const paths = new Map(buckets.map((bucket) => [bucket, []]));
  let failure;

  try {
    for (const bucket of buckets) {
      const path = `${workspaceId}/${randomUUID()}/${runId}.png`;
      paths.get(bucket).push(path);
      const { error: uploadError } = await client.storage
        .from(bucket)
        .upload(path, png, {
          contentType: "image/png",
          upsert: false,
          cacheControl: "0",
        });
      requireCheck(!uploadError, "STORAGE_UPLOAD_FAILED");

      const { data, error: downloadError } = await client.storage
        .from(bucket)
        .download(path);
      requireCheck(!downloadError && data, "STORAGE_DOWNLOAD_FAILED");
      requireCheck(
        Buffer.from(await data.arrayBuffer()).equals(png),
        "STORAGE_BYTES_DIFFERENT",
      );

      const invalidMimePath = `${workspaceId}/${randomUUID()}/${runId}.txt`;
      paths.get(bucket).push(invalidMimePath);
      const { error: invalidMimeError } = await client.storage
        .from(bucket)
        .upload(
          invalidMimePath,
          Buffer.from("Synthetic verification fixture"),
          {
            contentType: "text/plain",
            upsert: false,
          },
        );
      requireCheck(Boolean(invalidMimeError), "STORAGE_INVALID_MIME_ACCEPTED");
      console.log(`PASS ${bucket}: image round-trip and MIME rejection`);
    }

    const invalidBucket = `stylora-verification-${runId}`;
    requireCheck(
      !bucketMetadata.some((bucket) => bucket.id === invalidBucket),
      "STORAGE_INVALID_TARGET_COLLISION",
    );
    const invalidPath = `${workspaceId}/${randomUUID()}/${runId}.png`;
    const { error: invalidTargetError } = await client.storage
      .from(invalidBucket)
      .upload(invalidPath, png, { contentType: "image/png", upsert: false });
    if (!invalidTargetError) {
      paths.set(invalidBucket, [invalidPath]);
      throw new VerificationError("STORAGE_INVALID_TARGET_ACCEPTED");
    }
    console.log("PASS nonexistent bucket rejected");
  } catch (error) {
    failure = error;
  } finally {
    let cleanupFailed = false;
    for (const [bucket, objectPaths] of paths) {
      if (objectPaths.length === 0) continue;
      try {
        const { error } = await client.storage.from(bucket).remove(objectPaths);
        if (error) {
          cleanupFailed = true;
          continue;
        }
        for (const path of objectPaths) {
          const { error: downloadError } = await client.storage
            .from(bucket)
            .download(path);
          if (!isMissingObject(downloadError)) cleanupFailed = true;
        }
      } catch {
        cleanupFailed = true;
      }
    }
    if (cleanupFailed)
      throw new VerificationError("STORAGE_FIXTURE_CLEANUP_FAILED");
    console.log("PASS synthetic storage objects removed");
  }

  if (failure) throw failure;
}

async function main() {
  const args = process.argv.slice(2);
  requireCheck(
    args.length === 0 || (args.length === 1 && args[0] === "--write-storage"),
    "ARGUMENT_INVALID_USE_OPTIONAL_WRITE_STORAGE_FLAG",
  );
  const writeStorage = args.includes("--write-storage");
  const config = await readConfiguration();
  requireCheck(
    !writeStorage || config.writesEnabled,
    "WORKSPACE_WRITES_DISABLED",
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
            ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)])
            : AbortSignal.timeout(15_000),
        }),
    },
  });

  const { data: workspace, error: workspaceError } = await client
    .from("workspaces")
    .select("id")
    .eq("id", config.workspaceId)
    .maybeSingle();
  requireCheck(!workspaceError, "WORKSPACE_CONNECTION_FAILED");
  requireCheck(workspace?.id === config.workspaceId, "WORKSPACE_NOT_FOUND");
  console.log("PASS configured workspace connection");

  const { data: bucketMetadata, error: bucketError } =
    await client.storage.listBuckets();
  requireCheck(!bucketError && bucketMetadata, "STORAGE_METADATA_UNAVAILABLE");
  for (const bucketId of buckets) {
    const bucket = bucketMetadata.find((entry) => entry.id === bucketId);
    const expectedMimeTypes = allowedMimeTypes[bucketId];
    requireCheck(bucket?.public === false, "STORAGE_BUCKET_MISSING_OR_PUBLIC");
    requireCheck(
      Number(bucket.file_size_limit) === maxBytes,
      "STORAGE_BYTE_LIMIT_INVALID",
    );
    requireCheck(
      bucket.allowed_mime_types?.length === expectedMimeTypes.length &&
        expectedMimeTypes.every((mime) =>
          bucket.allowed_mime_types.includes(mime),
        ),
      "STORAGE_MIME_ALLOWLIST_INVALID",
    );
  }
  console.log("PASS three private buckets with image and byte restrictions");

  if (writeStorage) {
    await verifyStorageRoundTrip(client, config.workspaceId, bucketMetadata);
  } else {
    console.log(
      "SKIP object writes: use --write-storage with DEMO_WRITES_ENABLED=true",
    );
  }
}

try {
  await main();
} catch (error) {
  console.error(
    `FAIL ${error instanceof VerificationError ? error.code : "VERIFICATION_FAILED"}`,
  );
  process.exitCode = 1;
}
