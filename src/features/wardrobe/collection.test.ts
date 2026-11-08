import { describe, expect, it } from "vitest";
import {
  matchesWardrobeCollectionQuery,
  toWardrobeCollectionItem,
} from "./collection";

const source = {
  id: "d8ef45dc-6473-492d-8c2f-e22b8131e976",
  name: "Blue shirt",
  category: "top" as const,
  subcategory: "Oxford shirt",
  description: "Button front with a curved hem",
  attributes: { apparentMaterial: "cotton-like", colors: ["blue", "ivory"] },
  notes: "Cold wash preferred",
  sourceType: "sample" as const,
  inventoryStatus: "owned" as const,
  imageUrl:
    "/api/wardrobe/d8ef45dc-6473-492d-8c2f-e22b8131e976/image?revision=3",
  imageKey: "local-photo-key",
};

describe("Wardrobe collection projection", () => {
  it("preserves case-insensitive search across card text, field labels, array values and notes", () => {
    const item = toWardrobeCollectionItem(source);
    for (const query of [
      "  BLUE SHIRT  ",
      "oxford",
      "button front",
      "apparent material",
      "cotton-like",
      "Colors (comma separated)",
      "blue, ivory",
      "cold wash",
      "",
    ])
      expect(matchesWardrobeCollectionQuery(item, query)).toBe(true);
    expect(matchesWardrobeCollectionQuery(item, "wool coat")).toBe(false);
  });

  it("allows only collection fields and excludes canonical evidence from the serialized payload", () => {
    const canonical = {
      ...source,
      provenance: { name: { evidence: "Internal source evidence" } },
      corrections: { name: { originalValue: "Old label" } },
      inferredAttributes: { apparentMaterial: "wool-like" },
      confidence: 0.8,
      uncertainty: ["Internal observation"],
      assetId: "2dc36f8d-62cc-42a6-8edf-37d8d273eb59",
    };
    const item = toWardrobeCollectionItem(canonical);
    expect(Object.keys(item).sort()).toEqual(
      [
        "id",
        "name",
        "category",
        "subcategory",
        "imageUrl",
        "imageKey",
        "isSample",
        "inventoryStatus",
        "marketplace",
        "searchText",
      ].sort(),
    );
    const serialized = JSON.stringify(item);
    for (const field of [
      "provenance",
      "corrections",
      "inferredAttributes",
      "confidence",
      "uncertainty",
      "assetId",
    ])
      expect(serialized).not.toContain(`"${field}"`);
    expect(
      matchesWardrobeCollectionQuery(item, "Internal source evidence"),
    ).toBe(false);
  });

  it("preserves sample and candidate classification, catalog evidence and stable image references", () => {
    expect(toWardrobeCollectionItem(source)).toMatchObject({
      isSample: true,
      inventoryStatus: "owned",
    });
    const marketplace = {
      sourceName: "Shopee",
      priceMinor: 15900000,
      currency: "IDR",
      rating: null,
      reviewCount: null,
      url: "https://shopee.co.id/example",
      retrievedAt: "2026-11-08T00:00:00Z",
    };
    const item = toWardrobeCollectionItem({
      ...source,
      sourceType: "live",
      inventoryStatus: "saved_candidate",
      marketplace,
    });
    expect(item.isSample).toBe(false);
    expect(item.inventoryStatus).toBe("saved_candidate");
    expect(item.marketplace).toEqual(marketplace);
    expect(item.imageUrl).toBe(source.imageUrl);
    expect(item.imageKey).toBe(source.imageKey);
  });
});
