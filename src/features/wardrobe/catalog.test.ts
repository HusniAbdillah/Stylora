import { describe, expect, it } from "vitest";
import {
  marketplaceMetadata,
  marketplacePrice,
  marketplaceLinkLabel,
} from "./catalog";

const product = {
  source_label: "Shopee",
  price_minor: 12990000,
  currency: "IDR",
  rating: 4.8,
  review_count: 120,
  product_url: "https://www.google.com/shopping/product/123",
  retrieved_at: "2026-11-07T00:00:00Z",
};
describe("Wardrobe marketplace metadata", () => {
  it("retains catalog facts, converts minor units and labels catalog destinations accurately", () => {
    const value = marketplaceMetadata(product);
    expect(value.rating).toBe(4.8);
    expect(value.reviewCount).toBe(120);
    expect(marketplacePrice(value)).toContain("129.900");
    expect(marketplaceLinkLabel(value)).toBe("Open Google catalog");
    expect(
      marketplaceLinkLabel(
        marketplaceMetadata({
          ...product,
          product_url: "https://shopee.co.id/example-i.1.2",
        }),
      ),
    ).toBe("Open Shopee");
  });
  it("keeps missing prices and ratings unknown and rejects invalid destinations", () => {
    const value = marketplaceMetadata({
      ...product,
      price_minor: null,
      currency: null,
      rating: null,
      review_count: null,
    });
    expect(marketplacePrice(value)).toBe("Price unavailable");
    expect(value.rating).toBeNull();
    expect(marketplaceMetadata({ ...product, rating: 0 }).rating).toBe(0);
    for (const product_url of [
      "javascript:alert(1)",
      "http://example.com/item",
      "https://user:password@example.com/item",
    ])
      expect(marketplaceMetadata({ ...product, product_url }).url).toBeNull();
    expect(() => marketplaceMetadata({ ...product, rating: 6 })).toThrow();
  });
});
