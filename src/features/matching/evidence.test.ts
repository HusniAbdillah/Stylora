import { describe, expect, it } from "vitest";
import { z } from "zod";
import { explanationSchema } from "@/lib/ai/fashion-schema";
import {
  createEvidenceProjection,
  projectRecommendationItem,
} from "./evidence";
import type { MatchItem } from "./gates";

const piece: MatchItem = {
  id: "b2574e91-24d9-4b02-a086-06d3703bce58",
  name: "Ivory shirt",
  category: "top",
  subcategory: "shirt",
  attributes: {
    primaryColor: "ivory",
    colors: ["ivory"],
    fit: null,
    texture: "",
    drape: "unknown",
  },
  sourceType: "live",
  revision: 4,
};
const item: MatchItem = {
  ...piece,
  id: "f10b9179-6273-45e5-a240-b091990d4f8c",
  inventoryStatus: "saved_candidate",
  archivedAt: "2026-11-07T00:00:00Z",
  sourceType: "sample",
};
const input = {
  pieces: [piece],
  inventory: [item],
  preferences: { undertone: "warm", styles: ["relaxed_minimal"], fit: [] },
  occasion: "Work",
  sourceRevision: 4,
};

describe("per-request recommendation evidence", () => {
  it("catalogs only present fashion values and preserves real sources and ownership", () => {
    const { catalog, allowedInputs } = createEvidenceProjection(input);
    expect(catalog).toContainEqual(
      expect.objectContaining({
        reference: {
          source: "inspiration",
          id: piece.id,
          path: "attributes.primaryColor",
        },
        value: "ivory",
      }),
    );
    expect(catalog).toContainEqual(
      expect.objectContaining({
        reference: { source: "wardrobe", id: item.id, path: "inventoryStatus" },
        value: "saved_candidate",
      }),
    );
    expect(catalog).toContainEqual(
      expect.objectContaining({
        reference: { source: "preference", id: null, path: "styles" },
        value: ["relaxed_minimal"],
      }),
    );
    expect(
      catalog.some((entry) =>
        [
          "attributes.fit",
          "attributes.texture",
          "attributes.drape",
          "fit",
        ].includes(entry.reference.path),
      ),
    ).toBe(false);
    expect(allowedInputs).toEqual([
      "inspiration",
      "wardrobe",
      "occasion",
      "styles",
      "undertone",
    ]);
  });

  it("constrains provider keys then expands to unchanged canonical references", () => {
    const projection = createEvidenceProjection(input);
    const shirtEvidence = projection.catalog.find(
      (entry) =>
        entry.reference.source === "inspiration" &&
        entry.reference.path === "attributes.primaryColor",
    )!;
    const preferenceEvidence = projection.catalog.find(
      (entry) =>
        entry.reference.source === "preference" &&
        entry.reference.path === "undertone",
    )!;
    const providerOutput = {
      summary: "The supplied palette is kept close to the reference.",
      whyThis: [
        {
          reason: "The reference shirt has an ivory color.",
          evidence: [shirtEvidence.key],
        },
        {
          reason: "The selected undertone is warm.",
          evidence: [preferenceEvidence.key],
        },
      ],
      inputsUsed: ["inspiration", "undertone"],
      differences: [],
      uncertainty: [],
      sourceRevision: 4,
    };
    const result = projection.schema.parse(providerOutput);
    expect(result.whyThis[0].evidence).toEqual([shirtEvidence.reference]);
    expect(result.whyThis[1].evidence).toEqual([preferenceEvidence.reference]);
    expect(explanationSchema.safeParse(result).success).toBe(true);
    expect(
      projection.schema.safeParse({ ...providerOutput, sourceRevision: 5 })
        .success,
    ).toBe(false);
    expect(
      projection.schema.safeParse({
        ...providerOutput,
        inputsUsed: ["not_supplied"],
      }).success,
    ).toBe(false);
    for (const invalid of [
      0,
      projection.catalog.length + 1,
      1.5,
      "invented_key",
      { source: "wardrobe", id: piece.id, path: "fabric" },
    ]) {
      expect(
        projection.schema.safeParse({
          ...providerOutput,
          whyThis: [
            { ...providerOutput.whyThis[0], evidence: [invalid] },
            providerOutput.whyThis[1],
          ],
        }).success,
      ).toBe(false);
    }
  });

  it("exports bounded integer keys that index only supplied evidence", () => {
    const projection = createEvidenceProjection(input);
    expect(
      z.toJSONSchema(projection.schema, { target: "draft-7", io: "input" }),
    ).toMatchObject({
      properties: {
        whyThis: {
          items: {
            properties: {
              evidence: {
                items: {
                  type: "integer",
                  minimum: 1,
                  maximum: projection.catalog.length,
                },
              },
            },
          },
        },
      },
    });
  });

  it("does not expose missing inventory or skipped preferences as available inputs", () => {
    const projection = createEvidenceProjection({
      ...input,
      inventory: [],
      preferences: {},
      occasion: null,
    });
    expect(projection.allowedInputs).toEqual(["inspiration"]);
    expect(
      projection.catalog.every(
        (entry) => entry.reference.source === "inspiration",
      ),
    ).toBe(true);
  });

  it("keeps all inventory facts within the existing context limit without unused provenance", () => {
    const inventory = Array.from({ length: 80 }, (_, index) => ({
      ...item,
      id: `f10b9179-6273-45e5-a240-${String(index).padStart(12, "0")}`,
      description: "Ivory shirt with a relaxed woven silhouette.",
      confidence: 0.8,
      attributes: {
        ...item.attributes,
        apparentMaterial: null,
        patternColors: [],
      },
      provenance: Object.fromEntries(
        Array.from({ length: 100 }, (_, key) => [
          `attributes.field${key}`,
          {
            source: "visual_inference",
            evidence: "Visible garment detail. ".repeat(20),
          },
        ]),
      ),
    }));
    const evidence = createEvidenceProjection({ ...input, inventory });
    const rawContext = {
      pieces: input.pieces,
      inventory,
      evidenceCatalog: evidence.providerCatalog,
    };
    const compactContext = {
      pieces: input.pieces.map(projectRecommendationItem),
      inventory: inventory.map(projectRecommendationItem),
      evidenceCatalog: evidence.providerCatalog,
    };
    expect(
      new TextEncoder().encode(JSON.stringify(rawContext)).byteLength,
    ).toBeGreaterThan(300_000);
    expect(
      new TextEncoder().encode(JSON.stringify(compactContext)).byteLength,
    ).toBeLessThan(300_000);
    expect(compactContext.inventory).toHaveLength(inventory.length);
    expect(compactContext.inventory[0]).toMatchObject({
      id: inventory[0].id,
      inventoryStatus: "saved_candidate",
      archivedAt: item.archivedAt,
      sourceType: "sample",
      description: inventory[0].description,
      confidence: 0.8,
      attributes: { primaryColor: "ivory", colors: ["ivory"] },
    });
    expect(compactContext.inventory[0]).not.toHaveProperty("provenance");
    expect(compactContext.inventory[0].attributes).not.toHaveProperty(
      "apparentMaterial",
    );
    expect(compactContext.inventory[0].attributes).not.toHaveProperty(
      "patternColors",
    );
  });
});
