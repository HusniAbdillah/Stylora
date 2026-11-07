import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { normalizeOffer, supportedCategory } from "./provider";

const catalog = {
  title: "Ivory relaxed shirt",
  source: "Catalog retailer",
  product_link: "https://www.google.com/shopping/product/123",
  product_id: "123",
};

describe("catalog normalization", () => {
  it("keeps ambiguous currency and absent ratings unknown", () => {
    const product = normalizeOffer(
      { ...catalog, price: "$10.00", extracted_price: 10 },
      "top",
    );
    expect(product).toMatchObject({
      priceMinor: null,
      currency: null,
      rating: null,
      reviewCount: null,
    });
    expect(
      normalizeOffer(
        { ...catalog, price: "Rp10.000", extracted_price: 10000 },
        "top",
      ),
    ).toMatchObject({ priceMinor: 1_000_000, currency: "IDR" });
  });
  it("rejects category contradictions and non-garment accessories", () => {
    expect(normalizeOffer(catalog, "shoes")).toBeNull();
    expect(supportedCategory("Sneaker cleaning kit")).toBeNull();
    expect(supportedCategory("Shirt dress")).toBe("dress");
  });
  it("stores IDR minor units independently of runtime display defaults", () => {
    const formatter = vi.spyOn(Intl, "NumberFormat").mockImplementation(() => {
      throw new Error("Display formatting is not a persistence contract");
    });
    try {
      expect(
        normalizeOffer(
          { ...catalog, currency: "IDR", extracted_price: 10000.5 },
          "top",
        ),
      ).toMatchObject({ priceMinor: 1_000_050, currency: "IDR" });
    } finally {
      formatter.mockRestore();
    }
  });
});
