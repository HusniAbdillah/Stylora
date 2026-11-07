import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import { createWorkspaceSignedRead } from "@/lib/supabase/storage";
import { checkWorkspaceConnection } from "@/lib/supabase/connection";
import {
  confirmWardrobeDraft,
  createWardrobeDraft,
  createWardrobeUpload,
  deleteWardrobeItem,
  getWardrobeItem,
  listActiveOwnedWardrobe,
  listWardrobeItems,
  manualWardrobeDraft,
  mutateWardrobeItem,
  verifyWardrobeUpload,
} from "./server";

const enabled = process.env.RUN_WARDROBE_ONLINE === "1";
if (enabled && process.env.WARDROBE_SMOKE_ENV_FILE)
  process.loadEnvFile(process.env.WARDROBE_SMOKE_ENV_FILE);
const workspaceId = "6d68ca94-8165-42a7-9ee3-c5d050371c4a";
describe.skipIf(!enabled)(
  "Wardrobe hosted integration (explicit dev-owner-1 opt-in)",
  () => {
    it("reads remaining starter metadata and real private images through the application storage helper", async () => {
      if (process.env.STYLORA_WORKSPACE_ID !== workspaceId)
        throw new Error("The smoke must target dev-owner-1.");
      expect((await checkWorkspaceConnection()).connected).toBe(true);
      const { client } = getWorkspaceDatabase();
      const inventory = await listWardrobeItems();
      const { data: seed, error } = await client
        .from("wardrobe_items")
        .select("id,asset_id,import_idempotency_key")
        .eq("workspace_id", workspaceId)
        .like("import_idempotency_key", "wardrobe-starter.v1:%");
      if (error || !seed) throw new Error("Starter query failed.");
      expect(seed.length).toBeLessThanOrEqual(45);
      expect(
        seed.every((row) =>
          inventory.items.some(
            (item) =>
              item.id === row.id &&
              item.sourceType === "sample" &&
              item.inventoryStatus === "owned",
          ),
        ),
      ).toBe(true);
      const manifest = JSON.parse(
        readFileSync("data/wardrobe/wardrobe.json", "utf8"),
      );
      const expected = new Map<string, string>(
        manifest.items.map(
          (item: { id: string; annotation: { imageSha256: string } }) => [
            `wardrobe-starter.v1:${item.id}`,
            item.annotation.imageSha256,
          ],
        ),
      );
      for (let offset = 0; offset < seed.length; offset += 5) {
        await Promise.all(
          seed.slice(offset, offset + 5).map(async (row) => {
            const signed = await createWorkspaceSignedRead(row.asset_id!);
            const response = await fetch(signed.signedUrl);
            if (!response.ok)
              throw new Error("Starter signed image read failed.");
            const hash = createHash("sha256")
              .update(Buffer.from(await response.arrayBuffer()))
              .digest("hex");
            expect(hash === expected.get(row.import_idempotency_key!)).toBe(
              true,
            );
          }),
        );
      }
    }, 120_000);

    it("uploads, verifies, confirms once, edits with revision checks, marks owned and permanently deletes its fixture", async () => {
      if (
        process.env.STYLORA_WORKSPACE_ID !== workspaceId ||
        process.env.DEMO_WRITES_ENABLED !== "true"
      )
        throw new Error("The smoke requires writable dev-owner-1.");
      const { client } = getWorkspaceDatabase();
      const drafts: string[] = [];
      const assets: string[] = [];
      let itemId: string | null = null;
      try {
        let draft = await createWardrobeDraft();
        drafts.push(draft.id);
        const bytes = await sharp({
          create: { width: 64, height: 64, channels: 3, background: "#334455" },
        })
          .webp()
          .toBuffer();
        const upload = await createWardrobeUpload({
          draftId: draft.id,
          expectedRevision: draft.revision,
          mimeType: "image/webp",
          byteSize: bytes.length,
        });
        assets.push(upload.assetId);
        draft = upload.draft;
        const response = await fetch(upload.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": "image/webp", "x-upsert": "false" },
          body: new Uint8Array(bytes),
        });
        expect(response.ok).toBe(true);
        draft = await verifyWardrobeUpload(draft.id, {
          assetId: upload.assetId,
          expectedRevision: draft.revision,
        });
        draft = await manualWardrobeDraft(draft.id, {
          expectedRevision: draft.revision,
        });
        const values = {
          name: "Wardrobe connectivity fixture",
          category: "top" as const,
          subcategory: null,
          description: "Temporary manual integration fixture.",
          attributes: { colors: ["blue"] },
        };
        const request = {
          expectedRevision: draft.revision,
          proposalId: draft.payload.proposals[0].id,
          values,
        };
        const result = await confirmWardrobeDraft(draft.id, request);
        itemId = result.itemId;
        expect(Boolean(itemId)).toBe(true);
        expect((await confirmWardrobeDraft(draft.id, request)).itemId).toBe(
          itemId,
        );
        const first = await getWardrobeItem(itemId!);
        expect(first.assetId).toBe(upload.assetId);
        const editor = await createWardrobeDraft({ itemId: first.id });
        drafts.push(editor.id);
        expect(editor.payload.editor?.values.name).toBe(first.name);
        const edited = await mutateWardrobeItem(first.id, {
          action: "edit",
          expectedRevision: first.revision,
          values: { ...values, name: "Edited connectivity fixture" },
          notes: "Disposable test fixture.",
        });
        expect(edited.corrections.name.value).toBe(
          "Edited connectivity fixture",
        );
        await expect(
          deleteWardrobeItem(first.id, {
            expectedRevision: first.revision,
          }),
        ).rejects.toMatchObject({ code: "revision_conflict" });
        const candidate = await client
          .from("wardrobe_items")
          .update({
            inventory_status: "saved_candidate",
            revision: edited.revision + 1,
          })
          .eq("workspace_id", workspaceId)
          .eq("id", first.id)
          .select("revision")
          .single();
        if (candidate.error)
          throw new Error("Candidate fixture preparation failed.");
        expect(
          (await listActiveOwnedWardrobe()).some(
            (item) => item.id === first.id,
          ),
        ).toBe(false);
        const owned = await mutateWardrobeItem(first.id, {
          action: "mark_owned",
          expectedRevision: candidate.data.revision,
        });
        process.env.STYLORA_WORKSPACE_ID =
          "58fcedac-9b26-48b3-bf12-98af3f6c9b27";
        await expect(getWardrobeItem(first.id)).rejects.toMatchObject({
          code: "wardrobe_not_found",
        });
        process.env.STYLORA_WORKSPACE_ID = workspaceId;
        process.env.DEMO_WRITES_ENABLED = "false";
        await expect(
          deleteWardrobeItem(first.id, {
            expectedRevision: owned.revision,
          }),
        ).rejects.toMatchObject({ code: "WORKSPACE_WRITES_DISABLED" });
        process.env.DEMO_WRITES_ENABLED = "true";
        const deletion = { expectedRevision: owned.revision };
        expect(await deleteWardrobeItem(first.id, deletion)).toEqual({
          deleted: true,
          itemId: first.id,
        });
        expect(await deleteWardrobeItem(first.id, deletion)).toEqual({
          deleted: true,
          itemId: first.id,
        });
        await expect(getWardrobeItem(first.id)).rejects.toMatchObject({
          code: "wardrobe_not_found",
        });
      } finally {
        process.env.STYLORA_WORKSPACE_ID = workspaceId;
        process.env.DEMO_WRITES_ENABLED = "true";
        if (itemId) {
          const removed = await client
            .from("wardrobe_items")
            .delete()
            .eq("workspace_id", workspaceId)
            .eq("id", itemId);
          if (removed.error) throw new Error("Fixture item cleanup failed.");
        }
        for (const id of drafts) {
          const removed = await client
            .from("workflow_drafts")
            .delete()
            .eq("workspace_id", workspaceId)
            .eq("id", id);
          if (removed.error) throw new Error("Fixture draft cleanup failed.");
        }
        for (const id of assets) {
          const { data } = await client
            .from("assets")
            .select("storage_path")
            .eq("workspace_id", workspaceId)
            .eq("id", id)
            .single();
          if (data) {
            const removed = await client.storage
              .from("wardrobe")
              .remove([data.storage_path]);
            if (removed.error) throw new Error("Fixture image cleanup failed.");
          }
          const removed = await client
            .from("assets")
            .delete()
            .eq("workspace_id", workspaceId)
            .eq("id", id);
          if (removed.error) throw new Error("Fixture asset cleanup failed.");
        }
      }
    }, 90_000);
  },
);
