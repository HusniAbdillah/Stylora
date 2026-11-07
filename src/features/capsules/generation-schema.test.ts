import { describe, expect, it } from "vitest";
import { EMPTY_CAPSULE_DRAFT } from "./capsule-types";
import { validateCapsuleGeneration } from "./generation-schema";

const ids = [1, 2, 3, 4, 5].map(
  (number) => `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
);
const items = ids.map((id, index) => ({
  id,
  name: `Fixture ${index}`,
  category: (index < 2 ? "top" : index < 4 ? "bottom" : "shoes") as
    "top" | "bottom" | "shoes",
  revision: 1,
  attributes: {},
}));
const draft = {
  ...EMPTY_CAPSULE_DRAFT,
  targetOutfits: 3,
  includedItemIds: ids,
  requiredItemIds: [ids[0]],
};
function fixture() {
  return {
    outfits: [
      [ids[0], ids[2], ids[4]],
      [ids[1], ids[2], ids[4]],
      [ids[0], ids[3], ids[4]],
    ].map((itemIds) => ({
      title: "Fixture outfit",
      occasion: "City walks",
      itemIds,
      additionKeys: [],
      summary: "Fixture composition.",
      whyThis: [
        {
          reason: "The pieces share a palette.",
          evidenceItemIds: itemIds.slice(0, 2),
        },
        { reason: "The shoes complete the outfit.", evidenceItemIds: [ids[4]] },
      ],
      inputsUsed: ["Owned wardrobe"],
      differences: [],
      uncertainty: ["Fabric composition is unverified."],
    })),
    additions: [],
  };
}

describe("capsule output integrity", () => {
  it("accepts distinct complete outfits using supplied owned IDs", () => {
    expect(
      validateCapsuleGeneration(fixture(), draft, items, ["Owned wardrobe"])
        .outfits,
    ).toHaveLength(3);
  });
  it("rejects invented IDs and accessory-only or reordered duplicate combinations", () => {
    const invented = fixture();
    invented.outfits[0].itemIds[0] = "20000000-0000-4000-8000-000000000001";
    expect(() =>
      validateCapsuleGeneration(invented, draft, items, ["Owned wardrobe"]),
    ).toThrow();
    const duplicate = fixture();
    duplicate.outfits[1] = {
      ...duplicate.outfits[0],
      itemIds: [...duplicate.outfits[0].itemIds].reverse(),
    };
    expect(() =>
      validateCapsuleGeneration(duplicate, draft, items, ["Owned wardrobe"]),
    ).toThrow("capsule_outfits_not_distinct");
  });
  it("rejects unsupported preference claims and missing complete outfit roles", () => {
    const unsupported = fixture();
    unsupported.outfits[0].inputsUsed = ["Preference: undertone"];
    expect(() =>
      validateCapsuleGeneration(unsupported, draft, items, ["Owned wardrobe"]),
    ).toThrow();
    const incomplete = fixture();
    incomplete.outfits[0].itemIds = [ids[0], ids[2]];
    expect(() =>
      validateCapsuleGeneration(incomplete, draft, items, ["Owned wardrobe"]),
    ).toThrow();
  });
  it("requires every proposed use to appear in its addition reuse evidence", () => {
    const output = {
      ...fixture(),
      outfits: fixture().outfits.map((outfit, index) => ({
        ...outfit,
        additionKeys: index < 2 ? ["light-layer"] : [],
      })),
      additions: [
        {
          key: "light-layer",
          roleGap: "A light outer layer for the evening.",
          supportingItemIds: [ids[0], ids[2]],
          unlockedOutfitIndices: [0, 1],
          brief: {
            schemaVersion: "fashion-item.v1",
            name: "Light jacket",
            category: "outerwear",
            subcategory: "jacket",
            description: "A light neutral outer layer.",
            inventoryStatus: "not_applicable",
            attributes: {
              garmentForm: "jacket",
              functionalFamily: "everyday",
              primaryColor: "ivory",
              pattern: "solid",
              apparentMaterial: null,
              silhouette: "straight",
              fit: "relaxed",
              layeringRole: "outer",
              formality: "smart casual",
              coverage: null,
            },
            uncertainty: [],
          },
        },
      ],
    };
    expect(
      validateCapsuleGeneration(output, draft, items, ["Owned wardrobe"])
        .additions,
    ).toHaveLength(1);
    output.outfits[2].additionKeys = ["light-layer"];
    expect(() =>
      validateCapsuleGeneration(output, draft, items, ["Owned wardrobe"]),
    ).toThrow();
  });
});
