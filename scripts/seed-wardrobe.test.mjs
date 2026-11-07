import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seedIdentity, validateManifest } from "./seed-wardrobe.mjs";

const dataset = JSON.parse(
  readFileSync(
    new URL("../data/wardrobe/wardrobe.json", import.meta.url),
    "utf8",
  ),
);

describe("wardrobe starter seed", () => {
  it("accepts the source records while keeping source and ownership distinct", () => {
    const manifest = validateManifest(dataset);
    expect(manifest.items).toHaveLength(45);
    expect(
      manifest.items.every(
        (item) =>
          item.sourceType === "sample" && item.inventoryStatus === "owned",
      ),
    ).toBe(true);
  });

  it("keeps retry identities stable and separates workspaces and assets", () => {
    const first = seedIdentity("workspace-a", dataset.items[0].id);
    expect(seedIdentity("workspace-a", dataset.items[0].id)).toEqual(first);
    expect(seedIdentity("workspace-b", dataset.items[0].id).itemId).not.toBe(
      first.itemId,
    );
    expect(seedIdentity("workspace-a", dataset.items[1].id).itemId).not.toBe(
      first.itemId,
    );
    expect(first.assetId).not.toBe(first.itemId);
    expect(first.itemId).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
  });

  it("rejects duplicate source identities before any upload", () => {
    const invalid = structuredClone(dataset);
    invalid.items[1].id = invalid.items[0].id;
    expect(() => validateManifest(invalid)).toThrow("DUPLICATE_SEED_KEY");
  });

  it("rejects traversal, candidate ownership and category-inapplicable fields", () => {
    for (const mutation of [
      (item) => {
        item.imageName = "../escape.webp";
      },
      (item) => {
        item.inventoryStatus = "saved_candidate";
      },
      (item) => {
        item.attributes.shoeType = "trainer";
        item.annotation.provenance["attributes.shoeType"] =
          item.annotation.provenance.category;
      },
    ]) {
      const invalid = structuredClone(dataset);
      mutation(invalid.items[0]);
      expect(() => validateManifest(invalid)).toThrow();
    }
  });
});
