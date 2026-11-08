import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { garmentProvenance } from "@/lib/ai/fashion-schema";
import { validateCreateResult } from "./create-result";

const assetId = "ad77a8cf-c749-48b1-b463-d21dd65ab503";
const pieceId = "27521082-6561-47ac-a732-ae19901b7849";
const wardrobeId = "6762a315-1490-409b-909b-f424450b06af";
const garment = {
  name: "Fixture shirt",
  category: "top" as const,
  subcategory: null,
  description: "A visible shirt.",
  attributes: {},
  confidence: 0.8,
  uncertainty: [],
  observations: ["name", "category", "description"].map((path) => ({
    path,
    source: "visual_inference" as const,
    state: "observed" as const,
    confidence: 0.8,
    evidence: "Visible in the fixture image.",
    uncertainty: null,
  })),
};
const context = {
  kind: "inspiration_description" as const,
  assetId,
  model: "fixture-model",
  preferences: {},
  occasion: null,
  sourceRevision: 1,
  pieces: [],
  inventory: [],
  inventoryMode: "combined" as const,
};
const explanation = {
  summary: "A fixture explanation.",
  whyThis: [1, 2].map(() => ({
    reason: "The reference includes a shirt.",
    evidence: [
      { source: "inspiration" as const, id: pieceId, path: "category" },
    ],
  })),
  inputsUsed: ["inspiration"],
  differences: [],
  uncertainty: [],
  sourceRevision: 1,
};

describe("validated Create result recovery", () => {
  it("revalidates complete garments and their original visual provenance after persistence", () => {
    const result = {
      pieces: [
        {
          ...garment,
          id: pieceId,
          position: 0,
          provenance: garmentProvenance(garment, assetId, context.model),
        },
      ],
    };
    expect(() =>
      validateCreateResult(JSON.parse(JSON.stringify(result)), context),
    ).not.toThrow();
    expect(() =>
      validateCreateResult(
        { pieces: [{ ...result.pieces[0], provenance: {} }] },
        context,
      ),
    ).toThrow();
    expect(() =>
      validateCreateResult(
        { pieces: [{ ...result.pieces[0], observations: [] }] },
        context,
      ),
    ).toThrow();
    expect(() =>
      validateCreateResult(
        { pieces: [result.pieces[0], result.pieces[0]] },
        context,
      ),
    ).toThrow();
  });
  it("rejects a saved confidence review citing another asset", () => {
    const review = {
      explanation: {
        ...explanation,
        whyThis: explanation.whyThis.map((reason) => ({
          ...reason,
          evidence: [{ source: "inspiration", id: wardrobeId, path: "image" }],
        })),
      },
      insights: [{ title: "Color", description: "Visible color." }],
      occasions: [],
    };
    expect(() =>
      validateCreateResult(review, {
        ...context,
        kind: "inspiration_confidence",
      }),
    ).toThrow();
  });
  it("rejects nonexistent match references before a commit-only recovery", () => {
    const match = {
      pieceId,
      wardrobeItemId: wardrobeId,
      outcome: "owned_match",
      score: 1,
      sharedAttributes: [],
      differences: [],
      evidenceCoverage: 1,
      rejectedCandidates: [],
      explanation,
      sourceType: "live",
    };
    expect(() =>
      validateCreateResult(
        { matches: [match] },
        {
          ...context,
          kind: "wardrobe_match",
          pieces: [
            { ...garment, id: pieceId, revision: 1, sourceType: "live" },
          ],
        },
      ),
    ).toThrow();
  });
  it("validates restored outfit composition, evidence, and item order without altering the result", () => {
    const piece = {
      ...garment,
      id: pieceId,
      revision: 1,
      sourceType: "live" as const,
    };
    const inventory = [
      { ...piece, id: wardrobeId, category: "dress", inventoryStatus: "owned" },
    ];
    const option = {
      optionType: "closest",
      title: "Fixture direction",
      concept: "A supplied dress.",
      status: "ready",
      explanation,
      sourceType: "live",
      items: [
        {
          slotId: "dress_1",
          category: "dress",
          itemKind: "owned",
          pieceId: null,
          wardrobeItemId: wardrobeId,
          missingBrief: null,
          rationale: "The supplied dress.",
          position: 0,
        },
      ],
    };
    const input = {
      ...context,
      kind: "option_regeneration" as const,
      optionType: "closest" as const,
      pieces: [piece],
      inventory,
    };
    const result = { options: [option] };
    const original = JSON.stringify(result);
    expect(() => validateCreateResult(result, input)).not.toThrow();
    expect(JSON.stringify(result)).toBe(original);
    expect(() =>
      validateCreateResult({ options: [{ ...option, items: [] }] }, input),
    ).toThrow();
    expect(() =>
      validateCreateResult(
        {
          options: [
            { ...option, items: [{ ...option.items[0], position: 2 }] },
          ],
        },
        input,
      ),
    ).toThrow();
  });
});
