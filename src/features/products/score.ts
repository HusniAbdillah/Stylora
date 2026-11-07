import { defaultWeights, type ScoreWeights } from "./schema";

export const SCORE_VERSION = "v1";

export function relevanceScore(query: string, title: string): number | null {
  const tokens = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFKC")
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  const requested = [...new Set(tokens(query))].filter(
    (token) => token.length > 1,
  );
  if (requested.length === 0) return null;
  const available = new Set(tokens(title));
  return (
    requested.filter((token) => available.has(token)).length / requested.length
  );
}

export function scoreOffer(
  offer: {
    priceMinor: number | null;
    currency: string | null;
    rating: number | null;
    relevance: number | null;
  },
  comparablePrices: number[],
  comparableCurrency: string | null,
  weights: ScoreWeights = defaultWeights,
) {
  let price: number | null = null;
  if (
    offer.currency &&
    offer.currency === comparableCurrency &&
    offer.priceMinor !== null &&
    comparablePrices.length >= 2
  ) {
    const min = Math.min(...comparablePrices);
    const max = Math.max(...comparablePrices);
    price = min === max ? 1 : (max - offer.priceMinor) / (max - min);
  }
  const factors = {
    price: price === null ? null : Math.min(1, Math.max(0, price)),
    rating: offer.rating === null ? null : offer.rating / 5,
    relevance: offer.relevance,
  };
  const available = (Object.keys(factors) as (keyof ScoreWeights)[]).filter(
    (key) => factors[key] !== null && weights[key] > 0,
  );
  const denominator = available.reduce((total, key) => total + weights[key], 0);
  const normalizedWeights = { price: 0, rating: 0, relevance: 0 };
  for (const key of available)
    normalizedWeights[key] = weights[key] / denominator;
  const valueScore =
    denominator === 0
      ? null
      : available.reduce(
          (total, key) => total + (factors[key] ?? 0) * normalizedWeights[key],
          0,
        );
  return {
    valueScore,
    factors,
    normalizedWeights,
    scoreVersion: SCORE_VERSION,
  };
}
