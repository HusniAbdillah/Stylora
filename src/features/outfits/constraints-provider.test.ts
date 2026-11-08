import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createEvidenceProjection } from "@/features/matching/evidence";
import { outfitProviderSchema } from "./provider-schema";
import { validateOptionComposition } from "./schema";

const topId = "27521082-6561-47ac-a732-ae19901b7849";
const piece = {
  id: topId,
  name: "Fixture shirt",
  category: "top" as const,
  subcategory: "shirt",
  attributes: { primaryColor: "ivory" },
  sourceType: "manual" as const,
  revision: 1,
  inventoryStatus: "owned" as const,
};
const context = {
  pieces: [piece],
  inventory: [piece],
  preferences: {},
  occasion: null,
  sourceRevision: 1,
  inventoryMode: "combined" as const,
};
const evidence = createEvidenceProjection(context);
const explanation = {
  summary: "Fixture plan",
  whyThis: [
    {
      reason: "The supplied piece is a shirt.",
      evidence: [
        evidence.catalog.find((entry) => entry.reference.path === "category")!
          .key,
      ],
    },
    {
      reason: "Its supplied primary color is ivory.",
      evidence: [
        evidence.catalog.find(
          (entry) => entry.reference.path === "attributes.primaryColor",
        )!.key,
      ],
    },
  ],
  inputsUsed: ["inspiration"],
  differences: [],
  uncertainty: [],
  sourceRevision: 1,
};
const derived = {
  source: "derived",
  state: "inferred",
  confidence: null,
  evidence: "A proposed complement to the supplied shirt.",
  uncertainty: "Proposed rather than a catalog observation.",
};
const brief = {
  schemaVersion: "fashion-item.v1",
  garment: {
    name: "Proposed trousers",
    category: "bottom",
    subcategory: "trousers",
    description: "Navy trousers proposed for this composition.",
    coreEvidence: {
      name: derived,
      category: derived,
      subcategory: derived,
      description: derived,
    },
    attributes: [{ key: "primaryColor", value: "navy", ...derived }],
    confidence: null,
    uncertainty: ["This is a proposed item."],
  },
};
const option = () => ({
  title: "Fixture direction",
  concept: "A proposed pairing.",
  status: "ready",
  explanation,
  items: [
    {
      slotId: "top_1",
      category: "top",
      itemKind: "owned",
      pieceId: topId,
      wardrobeItemId: topId,
      missingBrief: null,
      rationale: "The supplied owned shirt.",
    },
    {
      slotId: "bottom_1",
      category: "bottom",
      itemKind: "missing",
      pieceId: null,
      wardrobeItemId: null,
      missingBrief: brief,
      rationale: "A proposed lower garment.",
    },
  ],
});

describe("closed outfit provider contract", () => {
  it("maps compact derived proposals into unchanged canonical brief fields", () => {
    const schema = outfitProviderSchema(
      { ...context, optionType: "closest" },
      evidence.schema,
    );
    const result = schema.parse({ options: { closest: option() } });
    expect(result.options[0].optionType).toBe("closest");
    expect(result.options[0].items[1].missingBrief).toMatchObject({
      schemaVersion: "fashion-item.v1",
      category: "bottom",
      attributes: { primaryColor: "navy" },
      observations: [
        expect.objectContaining({ source: "derived" }),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      ],
    });
    expect(
      validateOptionComposition(
        result.options,
        context.pieces,
        context.inventory,
        "closest",
        context,
      ),
    ).toEqual([]);
  });
  it("rejects invented owned IDs, references in the wrong category and observed-source proposed facts", () => {
    const schema = outfitProviderSchema(
      { ...context, optionType: "closest" },
      evidence.schema,
    );
    const wrongOwned = option();
    wrongOwned.items[0].wardrobeItemId = "e76c4e28-79f8-4f4c-8bbd-61b44504ae26";
    expect(schema.safeParse({ options: { closest: wrongOwned } }).success).toBe(
      false,
    );
    const wrongPiece = option();
    wrongPiece.items[1].pieceId = topId;
    expect(schema.safeParse({ options: { closest: wrongPiece } }).success).toBe(
      false,
    );
    const observed = structuredClone(option());
    observed.items[1].missingBrief!.garment.attributes[0].source =
      "visual_inference";
    expect(schema.safeParse({ options: { closest: observed } }).success).toBe(
      false,
    );
  });
  it("requires each direction once and makes an unsupported wardrobe direction honestly empty", () => {
    const schema = outfitProviderSchema(context, evidence.schema);
    expect(schema.safeParse({ options: { closest: option() } }).success).toBe(
      false,
    );
    const wire = z.toJSONSchema(schema, { io: "input", target: "draft-7" });
    expect(wire.properties?.options).toMatchObject({
      required: ["closest", "from_wardrobe", "fresh_alternative"],
      properties: {
        from_wardrobe: {
          properties: {
            status: { const: "unavailable" },
            items: { maxItems: 0 },
          },
        },
      },
    });
    const result = schema.parse({
      options: {
        closest: option(),
        fresh_alternative: option(),
        from_wardrobe: { ...option(), status: "unavailable", items: [] },
      },
    });
    expect(result.options.map((entry) => entry.optionType)).toEqual([
      "closest",
      "from_wardrobe",
      "fresh_alternative",
    ]);
  });
});
