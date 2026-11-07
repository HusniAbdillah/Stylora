import { describe, expect, it } from "vitest";
import {
  buildShoppingQuery,
  isShopeeSource,
  matchesShoppingTarget,
  shoppingContextKey,
  shoppingPreferences,
  shoppingSearchFingerprint,
} from "./search-context";

describe("Shopee shopping context", () => {
  it("uses the selected body illustration group and remains neutral when unset", () => {
    const men = shoppingPreferences(
      { bodyIllustrationGroup: "men", fit: "relaxed", styles: ["Minimalist"] },
      2,
    );
    expect(buildShoppingQuery("kemeja linen wanita", "top", men)).toBe(
      "kemeja linen relaxed Minimalist pria Shopee",
    );
    const women = shoppingPreferences({ bodyIllustrationGroup: "women" }, 2);
    expect(buildShoppingQuery("linen shirt", "top", women)).toBe(
      "linen shirt wanita Shopee",
    );
    for (const group of [undefined, null, "unknown"]) {
      const neutral = shoppingPreferences(
        { bodyIllustrationGroup: group, bodyIllustrationId: "pear" },
        1,
      );
      expect(neutral.target).toBeNull();
      expect(buildShoppingQuery("linen shirt pria", "top", neutral)).toBe(
        "linen shirt Shopee",
      );
    }
    const query = buildShoppingQuery("linen shirt", "top", men);
    expect(buildShoppingQuery(query, "top", men)).toBe(query);
    expect(buildShoppingQuery("x".repeat(600), "top", men)).toHaveLength(240);
  });

  it("rejects marketplace lookalikes and explicitly contradictory targets", () => {
    expect(isShopeeSource(" SHOPEE  Indonesia ")).toBe(true);
    expect(isShopeeSource("Shopee Mall")).toBe(true);
    expect(isShopeeSource("Shopee reseller")).toBe(false);
    expect(isShopeeSource("Not Shopee")).toBe(false);
    expect(matchesShoppingTarget("Kemeja wanita", "men")).toBe(false);
    expect(matchesShoppingTarget("Kemeja pria", "women")).toBe(false);
    expect(matchesShoppingTarget("Kemeja pria wanita unisex", "women")).toBe(
      true,
    );
    expect(matchesShoppingTarget("Kemeja linen", "women")).toBe(true);
  });

  it("invalidates results for preferences, revision, query and slot changes without score weights", () => {
    const preferences = shoppingPreferences(
      { bodyIllustrationGroup: "men" },
      3,
    );
    const input = {
      workspace: "workspace",
      lookId: "look",
      option: "option",
      revision: 1,
      slot: "top",
      item: "missing",
      itemRevision: 1,
      brief: { name: "linen shirt" },
      query: "linen shirt pria Shopee",
      preferences,
    };
    const baseline = shoppingSearchFingerprint(input);
    expect(
      shoppingSearchFingerprint({
        ...input,
        query: "cotton shirt pria Shopee",
      }),
    ).not.toBe(baseline);
    expect(shoppingSearchFingerprint({ ...input, itemRevision: 2 })).not.toBe(
      baseline,
    );
    expect(
      shoppingSearchFingerprint({
        ...input,
        preferences: { ...preferences, revision: 4 },
      }),
    ).not.toBe(baseline);
    expect(shoppingContextKey({ ...preferences, target: "women" })).not.toBe(
      shoppingContextKey(preferences),
    );
    const requestA = {
      weights: { price: 0.3, rating: 0.2, relevance: 0.5 },
      ...input,
    };
    const requestB = {
      weights: { price: 1, rating: 0, relevance: 0 },
      ...input,
    };
    expect(shoppingSearchFingerprint(requestA)).toBe(
      shoppingSearchFingerprint(requestB),
    );
  });
});
