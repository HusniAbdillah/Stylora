import { describe, expect, it } from "vitest";
import {
  evaluateCandidate,
  resolveEffectiveAttributes,
  type MatchItem,
} from "./gates";

const shirt: MatchItem = {
  id: "reference",
  name: "Ivory shirt",
  category: "top",
  subcategory: "shirt",
  attributes: {
    primaryColor: "ivory",
    functionalFamily: "everyday",
    constructionFamily: "woven",
    fit: "relaxed",
    pattern: "solid",
  },
  sourceType: "live",
  revision: 1,
};
const owned = (patch: Partial<MatchItem> = {}): MatchItem => ({
  ...shirt,
  id: "owned",
  inventoryStatus: "owned",
  archivedAt: null,
  ...patch,
});

describe("functional wardrobe matching", () => {
  it("requires active owned items and a compatible physical role", () => {
    expect(evaluateCandidate(shirt, owned()).eligible).toBe(true);
    for (const candidate of [
      owned({ inventoryStatus: "saved_candidate" }),
      owned({ archivedAt: "2026-11-07" }),
      owned({ category: "bottom" }),
    ])
      expect(evaluateCandidate(shirt, candidate).eligible).toBe(false);
  });
  it("rejects same-color jerseys and sport-specific footwear before scoring", () => {
    expect(
      evaluateCandidate(
        shirt,
        owned({
          subcategory: "football jersey",
          attributes: {
            ...shirt.attributes,
            functionalFamily: "sports_uniform",
          },
        }),
      ).reason,
    ).toBe("incompatible_functional_family");
    const loafer = {
      ...shirt,
      category: "shoes",
      subcategory: "loafer",
      attributes: { functionalFamily: "tailoring", primaryColor: "black" },
    };
    expect(
      evaluateCandidate(
        loafer,
        owned({
          category: "shoes",
          subcategory: "cleats",
          attributes: { primaryColor: "black" },
        }),
      ).eligible,
    ).toBe(false);
  });

  it("rejects outdoor shells as dinner-jacket substitutes", () => {
    const dinnerJacket = {
      ...shirt,
      category: "outerwear",
      subcategory: "dinner jacket",
      attributes: {
        primaryColor: "black",
        functionalFamily: "tailoring",
        constructionFamily: "structured",
        fit: "regular",
      },
    };
    const shell = owned({
      category: "outerwear",
      subcategory: "rain shell",
      attributes: { ...dinnerJacket.attributes, functionalFamily: "outdoor" },
    });
    expect(evaluateCandidate(dinnerJacket, shell).reason).toBe(
      "incompatible_functional_family",
    );
  });
  it("does not count absent or unknown evidence as agreement", () => {
    expect(
      evaluateCandidate(
        {
          ...shirt,
          subcategory: null,
          attributes: { primaryColor: "ivory", fit: "unknown" },
        },
        owned({
          subcategory: null,
          attributes: { primaryColor: "ivory", fit: "unknown" },
        }),
      ).eligible,
    ).toBe(false);
    const comparison = evaluateCandidate(
      shirt,
      owned({ attributes: { ...shirt.attributes, primaryColor: "cream" } }),
    );
    expect(comparison.eligible).toBe(true);
    expect(comparison.differences).toContain(
      "primaryColor: reference ivory; wardrobe cream",
    );
  });
  it("applies corrections above persisted and inferred observations", () => {
    expect(
      resolveEffectiveAttributes({
        inferredAttributes: { fit: "slim", apparentMaterial: "silk-like" },
        attributes: { fit: "regular" },
        corrections: { "attributes.fit": { correctedValue: "relaxed" } },
      }),
    ).toEqual({ fit: "relaxed", apparentMaterial: "silk-like" });
  });

  it("enforces supplied coverage and footwear constraints", () => {
    expect(
      evaluateCandidate(
        shirt,
        owned({ attributes: { ...shirt.attributes, sleeve: "sleeveless" } }),
        null,
        { coverage: ["Shoulders covered"] },
      ).reason,
    ).toBe("coverage_contradiction");
    const shoes = { ...shirt, category: "shoes", subcategory: "loafers" };
    expect(
      evaluateCandidate(
        shoes,
        owned({
          category: "shoes",
          subcategory: "loafers",
          attributes: { ...shirt.attributes, heelHeightClass: "high" },
        }),
        null,
        { footwearComfort: ["Flats only"] },
      ).reason,
    ).toBe("footwear_comfort_contradiction");
  });
});
