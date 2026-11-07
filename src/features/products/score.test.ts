import { describe, expect, it } from "vitest";
import { relevanceScore, scoreOffer } from "./score";

describe("offer evidence scoring", () => {
  it("renormalizes over available evidence instead of scoring unknown prices as zero", () => {
    const result = scoreOffer(
      { priceMinor: null, currency: null, rating: 5, relevance: 0.5 },
      [],
      null,
    );
    expect(result.factors.price).toBeNull();
    expect(result.valueScore).toBeCloseTo((0.2 + 0.5 * 0.5) / 0.7);
    expect(result.normalizedWeights.price).toBe(0);
  });

  it("does not compare currencies and returns no score without evidence", () => {
    expect(
      scoreOffer(
        { priceMinor: 100, currency: "IDR", rating: null, relevance: 1 },
        [50, 100],
        null,
      ).factors.price,
    ).toBeNull();
    expect(
      scoreOffer(
        { priceMinor: null, currency: null, rating: null, relevance: null },
        [],
        null,
      ).valueScore,
    ).toBeNull();
  });

  it("ranks comparable prices while relevance depends on actual title tokens", () => {
    expect(
      scoreOffer(
        { priceMinor: 100, currency: "IDR", rating: null, relevance: null },
        [100, 200],
        "IDR",
      ).valueScore,
    ).toBe(1);
    expect(
      scoreOffer(
        { priceMinor: 200, currency: "IDR", rating: null, relevance: null },
        [100, 200],
        "IDR",
      ).valueScore,
    ).toBe(0);
    expect(
      relevanceScore("ivory tailored shirt", "Ivory relaxed shirt"),
    ).toBeCloseTo(2 / 3);
    expect(
      relevanceScore("ivory tailored shirt", "Black football jersey"),
    ).toBe(0);
  });
});
