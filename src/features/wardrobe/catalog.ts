import { z } from "zod";
import type { Database } from "@/types/database";

const marketplaceSchema = z.object({
  sourceName: z.string().trim().min(1).max(200),
  priceMinor: z.number().int().nonnegative().nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  rating: z.number().min(0).max(5).nullable(),
  reviewCount: z.number().int().nonnegative().nullable(),
  url: z.url().nullable(),
  retrievedAt: z.string(),
});
export type MarketplaceMetadata = z.infer<typeof marketplaceSchema>;

type Product = Database["public"]["Tables"]["products"]["Row"];
export function marketplaceMetadata(
  product: Pick<
    Product,
    | "source_label"
    | "price_minor"
    | "currency"
    | "rating"
    | "review_count"
    | "product_url"
    | "retrieved_at"
  >,
): MarketplaceMetadata {
  let url: string | null = null;
  try {
    const parsed = new URL(product.product_url);
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password)
      url = parsed.href;
  } catch {
    /* Invalid legacy destinations stay unavailable. */
  }
  return marketplaceSchema.parse({
    sourceName: product.source_label,
    priceMinor: product.price_minor,
    currency: product.currency,
    rating: product.rating,
    reviewCount: product.review_count,
    url,
    retrievedAt: product.retrieved_at,
  });
}

export function marketplacePrice(value: MarketplaceMetadata) {
  if (value.priceMinor === null || !value.currency) return "Price unavailable";
  try {
    const formatter = new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: value.currency,
      maximumFractionDigits: value.currency === "IDR" ? 0 : undefined,
    });
    const digits =
      value.currency === "IDR"
        ? 2
        : (new Intl.NumberFormat("en", {
            style: "currency",
            currency: value.currency,
          }).resolvedOptions().maximumFractionDigits ?? 2);
    return formatter.format(value.priceMinor / 10 ** digits);
  } catch {
    return "Price unavailable";
  }
}

export function marketplaceLinkLabel(value: MarketplaceMetadata) {
  if (!value.url) return "Marketplace link unavailable";
  const host = new URL(value.url).hostname;
  return [
    "google.com",
    "www.google.com",
    "google.co.id",
    "www.google.co.id",
  ].includes(host)
    ? "Open Google catalog"
    : `Open ${value.sourceName}`;
}
