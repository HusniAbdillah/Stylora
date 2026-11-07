import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseDatabaseConfig } from "../src/lib/config/runtime-schema.ts";

const config = parseDatabaseConfig(process.env);
const expected = process.argv
  .find((value) => value.startsWith("--expected-workspace="))
  ?.split("=")[1];
const apply = process.argv.includes("--apply");
if (
  !config ||
  !expected ||
  config.workspaceId !== expected ||
  (apply && !config.writesEnabled)
)
  throw new Error("Approved workspace and enabled writes are required.");
const client = createClient(config.url, config.secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const manifest = JSON.parse(
  readFileSync(
    new URL("../data/wardrobe/wardrobe.json", import.meta.url),
    "utf8",
  ),
);
const items = new Map(
  manifest.items.map((item) => [`wardrobe-starter.v1:${item.id}`, item]),
);
const { data: rows, error } = await client
  .from("wardrobe_items")
  .select("id,asset_id,import_idempotency_key")
  .eq("workspace_id", config.workspaceId)
  .like("import_idempotency_key", "wardrobe-starter.v1:%");
if (error || rows.length !== manifest.itemCount)
  throw new Error("Starter inventory count mismatch.");
const rollback = [];
let normalized = 0;
for (const row of rows) {
  const item = items.get(row.import_idempotency_key);
  const { data: asset, error: assetError } = await client
    .from("assets")
    .select("*")
    .eq("workspace_id", config.workspaceId)
    .eq("id", row.asset_id)
    .eq("bucket", "wardrobe")
    .eq("status", "ready")
    .single();
  if (assetError || !item) throw new Error("Starter asset unavailable.");
  const parts = asset.storage_path.split("/");
  if (
    parts.length !== 3 ||
    parts[0] !== config.workspaceId ||
    !/^[0-9a-f-]{36}\.webp$/i.test(parts[2])
  )
    throw new Error("Unexpected starter path.");
  const target = `${config.workspaceId}/${asset.id}/${parts[2]}`;
  const previous = await client.storage
    .from("wardrobe")
    .download(asset.storage_path);
  if (previous.error || !previous.data)
    throw new Error("Starter image download failed.");
  const hash = createHash("sha256")
    .update(Buffer.from(await previous.data.arrayBuffer()))
    .digest("hex");
  if (hash !== item.annotation.imageSha256)
    throw new Error("Starter image hash mismatch.");
  if (target !== asset.storage_path && apply) {
    const copy = await client.storage
      .from("wardrobe")
      .copy(asset.storage_path, target);
    if (copy.error) {
      const existing = await client.storage.from("wardrobe").download(target);
      if (
        existing.error ||
        !existing.data ||
        createHash("sha256")
          .update(Buffer.from(await existing.data.arrayBuffer()))
          .digest("hex") !== hash
      )
        throw new Error("Starter copy failed.");
    }
    const verified = await client.storage.from("wardrobe").download(target);
    if (
      verified.error ||
      !verified.data ||
      createHash("sha256")
        .update(Buffer.from(await verified.data.arrayBuffer()))
        .digest("hex") !== hash
    )
      throw new Error("Copied image verification failed.");
    rollback.push({
      assetId: asset.id,
      previousPath: asset.storage_path,
      nextPath: target,
      previousRevision: asset.revision,
    });
    mkdirSync(new URL("../supabase/.temp/", import.meta.url), {
      recursive: true,
    });
    writeFileSync(
      new URL("../supabase/.temp/wardrobe-path-rollback.json", import.meta.url),
      JSON.stringify(rollback, null, 2),
    );
    const updated = await client
      .from("assets")
      .update({ storage_path: target, revision: asset.revision + 1 })
      .eq("workspace_id", config.workspaceId)
      .eq("id", asset.id)
      .eq("storage_path", asset.storage_path)
      .eq("revision", asset.revision)
      .select("id")
      .single();
    if (updated.error) throw new Error("Starter path revision conflict.");
    normalized++;
  }
}
console.log(
  JSON.stringify({
    workspaceId: config.workspaceId,
    checked: rows.length,
    normalized,
    mode: apply ? "apply" : "verify",
    oldObjectsRetained: true,
  }),
);
