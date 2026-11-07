import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyUserEdit,
  draftPayloadSchema,
  itemValuesSchema,
  mutationSchema,
  toCanonicalWardrobeItem,
  type WardrobeRow,
} from "./schema";
const id = "d8ef45dc-6473-492d-8c2f-e22b8131e976";
const values = {
  name: "Blue shirt",
  category: "top" as const,
  subcategory: null,
  description: "",
  attributes: { colors: ["blue"] },
};
describe("Wardrobe contracts", () => {
  it("adapts every starter item to the canonical envelope without inventing omitted attributes", () => {
    const manifest = JSON.parse(
      readFileSync("data/wardrobe/wardrobe.json", "utf8"),
    );
    for (const item of manifest.items) {
      const provenance = Object.fromEntries(
        Object.entries(item.annotation.provenance).map(([key, evidence]) => [
          key === "notes" ? "description" : key,
          evidence,
        ]),
      );
      const row = {
        id,
        name: item.name,
        category: item.category,
        subcategory: item.subcategory,
        description: item.notes,
        attributes: item.attributes,
        inferred_attributes: item.attributes,
        provenance,
        corrections: {},
        uncertainty: item.annotation.uncertainty,
        confidence: item.annotation.confidence,
        revision: 1,
        asset_id: id,
        source_type: "sample",
        inventory_status: "owned",
        notes: "",
        archived_at: null,
        created_at: "2026-11-07T00:00:00Z",
        source_product_id: null,
      } as WardrobeRow;
      const canonical = toCanonicalWardrobeItem(row);
      expect(canonical).toMatchObject({
        id,
        assetId: id,
        schemaVersion: "fashion-item.v1",
        sourceType: "sample",
        inventoryStatus: "owned",
        sourceReference: { kind: "wardrobe", id },
      });
      expect(canonical.attributes).toEqual(item.attributes);
      if (item === manifest.items[0]) {
        expect(() =>
          toCanonicalWardrobeItem({ ...row, attributes: null }),
        ).toThrow();
      }
    }
  });
  it("keeps original values and inference when edits are repeated or cleared", () => {
    const first = applyUserEdit(
      values,
      { ...values, attributes: { colors: ["red"] } },
      {},
      2,
    );
    const second = applyUserEdit(
      first.values,
      { ...values, attributes: { colors: ["green"] } },
      first.corrections,
      3,
    );
    expect(second.corrections["attributes.colors"]).toMatchObject({
      originalValue: ["blue"],
      previousValue: ["red"],
      value: ["green"],
      revision: 3,
    });
    const cleared = applyUserEdit(
      second.values,
      second.values,
      second.corrections,
      4,
      ["attributes.colors"],
    );
    expect(cleared.values.attributes.colors).toEqual(["blue"]);
    expect(cleared.corrections).toEqual({});
  });
  it("allows incomplete manual drafts but rejects invalid canonical fields and client workspace IDs", () => {
    expect(
      draftPayloadSchema.safeParse({
        version: "wardrobe-draft.v1",
        mode: "manual",
        proposals: [{ id, values: { ...values, name: "" }, original: null }],
        saved: {},
        metadata: {},
      }).success,
    ).toBe(true);
    expect(itemValuesSchema.safeParse({ ...values, name: "" }).success).toBe(
      false,
    );
    expect(
      itemValuesSchema.safeParse({
        ...values,
        attributes: { heelType: "stiletto" },
      }).success,
    ).toBe(false);
    expect(
      itemValuesSchema.safeParse({ ...values, attributes: { colors: "blue" } })
        .success,
    ).toBe(false);
    expect(
      mutationSchema.safeParse({
        action: "archive",
        expectedRevision: 1,
        workspaceId: id,
      }).success,
    ).toBe(false);
  });
});
