import { describe, expect, it } from "vitest";
import {
  attributesSchema,
  compactAttributes,
  canonicalDescriptionSchema,
  confidenceOutputSchema,
  descriptionSchema,
  garmentSchema,
  type Garment,
} from "./fashion-schema";

function garment(overrides: Partial<Garment> = {}): Garment {
  return {
    name: "Ivory shirt",
    category: "top",
    subcategory: "shirt",
    description: "A relaxed ivory shirt with a visible collar.",
    attributes: {
      colors: ["ivory"],
      primaryColor: "ivory",
      fit: "relaxed",
      collar: "spread",
    },
    observations: [],
    confidence: 0.8,
    uncertainty: ["Fiber composition is not verified."],
    ...overrides,
  };
}

describe("canonical fashion contracts", () => {
  it("requires evidence structurally for each provider attribute before canonical normalization", () => {
    const evidence = {
      source: "visual_inference",
      state: "observed",
      confidence: 0.8,
      evidence: "Visible in the uploaded reference.",
      uncertainty: null,
    };
    const projected = {
      name: "Ivory shirt",
      category: "top",
      subcategory: "shirt",
      description: "An ivory collared shirt.",
      coreEvidence: {
        name: evidence,
        category: evidence,
        subcategory: evidence,
        description: evidence,
      },
      attributes: [
        { key: "colors", value: ["ivory"], ...evidence },
        { key: "fit", value: "relaxed", ...evidence },
      ],
      confidence: 0.8,
      uncertainty: [],
    };
    const result = descriptionSchema.parse({ pieces: [projected] });
    expect(result.pieces[0].attributes).toEqual({
      colors: ["ivory"],
      fit: "relaxed",
    });
    expect(result.pieces[0].observations).toHaveLength(6);
    expect(
      descriptionSchema.safeParse({
        pieces: [
          {
            ...projected,
            attributes: [
              { key: "embellishments", value: "floral trim", ...evidence },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      descriptionSchema.safeParse({
        pieces: [
          {
            ...projected,
            attributes: [
              { key: "embellishments", value: ["floral trim"], ...evidence },
            ],
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      descriptionSchema.safeParse({
        pieces: [
          {
            ...projected,
            attributes: [{ key: "fit", value: ["relaxed"], ...evidence }],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      descriptionSchema.safeParse({
        pieces: [
          {
            ...projected,
            attributes: [
              {
                key: "colors",
                value: ["a", "b", "c", "d", "e", "f"],
                ...evidence,
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      descriptionSchema.safeParse({
        pieces: [
          {
            ...projected,
            attributes: [
              { key: "embellishments", value: ["x".repeat(41)], ...evidence },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      descriptionSchema.safeParse({
        pieces: [
          { ...projected, attributes: [{ key: "fit", value: "relaxed" }] },
        ],
      }).success,
    ).toBe(false);
    expect(
      descriptionSchema.safeParse({
        pieces: [
          {
            ...projected,
            attributes: [
              { key: "fit", value: "relaxed", ...evidence, source: "user" },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("constrains confidence evidence and inputs to the exact supplied snapshot", () => {
    const assetId = "a3b3eb59-ceb9-47a9-a179-e23c65c920b2";
    const schema = confidenceOutputSchema({
      assetId,
      sourceRevision: 3,
      preferenceKeys: ["undertone"],
      hasOccasion: true,
    });
    const reason = {
      reason: "The palette repeats the visible ivory.",
      evidence: [{ source: "inspiration", id: assetId, path: "image" }],
    };
    const review = {
      explanation: {
        summary: "A restrained palette.",
        whyThis: [reason, reason],
        inputsUsed: ["inspiration", "undertone"],
        differences: [],
        uncertainty: [],
        sourceRevision: 3,
      },
      insights: [
        { title: "Palette", description: "Ivory repeats through the look." },
      ],
      occasions: [],
    };
    expect(schema.safeParse(review).success).toBe(true);
    expect(
      schema.safeParse({
        ...review,
        explanation: { ...review.explanation, inputsUsed: ["bodyProfile"] },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...review,
        explanation: { ...review.explanation, sourceRevision: 2 },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...review,
        explanation: {
          ...review.explanation,
          whyThis: [
            {
              ...reason,
              evidence: [
                { source: "inspiration", id: assetId, path: "palette" },
              ],
            },
            reason,
          ],
        },
      }).success,
    ).toBe(false);
    const noPreferences = confidenceOutputSchema({
      assetId,
      sourceRevision: 3,
      preferenceKeys: [],
      hasOccasion: false,
    });
    expect(
      noPreferences.safeParse({
        ...review,
        explanation: { ...review.explanation, inputsUsed: ["inspiration"] },
      }).success,
    ).toBe(true);
    expect(noPreferences.safeParse(review).success).toBe(false);
  });

  it("rejects noncanonical, oversized and duplicated attributes", () => {
    expect(attributesSchema.safeParse({ material: "silk" }).success).toBe(
      false,
    );
    expect(
      attributesSchema.safeParse({ colors: ["ivory", "ivory"] }).success,
    ).toBe(false);
    expect(attributesSchema.safeParse({ fit: "x".repeat(121) }).success).toBe(
      false,
    );
  });

  it("rejects category-specific nonsense while retaining unknown fields as absent", () => {
    expect(
      garmentSchema.safeParse(
        garment({ category: "shoes", attributes: { neckline: "crew" } }),
      ).success,
    ).toBe(false);
    expect(
      garmentSchema.safeParse(garment({ attributes: { rise: "high" } }))
        .success,
    ).toBe(false);
    expect(
      compactAttributes({ fit: null, colors: [], primaryColor: "ivory" }),
    ).toEqual({ primaryColor: "ivory" });
  });

  it("requires image evidence for every populated field and rejects fabricated catalog provenance", () => {
    const reading = garment();
    expect(
      canonicalDescriptionSchema.safeParse({ pieces: [reading] }).success,
    ).toBe(false);
    const paths = [
      "name",
      "category",
      "subcategory",
      "description",
      "attributes.colors",
      "attributes.primaryColor",
      "attributes.fit",
      "attributes.collar",
    ];
    reading.observations = paths.map((path) => ({
      path,
      source: "visual_inference",
      state: "observed",
      confidence: 0.8,
      evidence: "Visible in the supplied image.",
      uncertainty: null,
    }));
    expect(
      canonicalDescriptionSchema.safeParse({ pieces: [reading] }).success,
    ).toBe(true);
    reading.observations[0].source = "catalog";
    expect(
      canonicalDescriptionSchema.safeParse({ pieces: [reading] }).success,
    ).toBe(false);
  });
});
