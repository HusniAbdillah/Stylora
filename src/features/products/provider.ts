import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/http";
import { offerSchema, type Category } from "./schema";
import {
  isShopeeSource,
  matchesShoppingTarget,
  type ShoppingTarget,
} from "./search-context";

const categoryPatterns: [Category, RegExp][] = [
  ["dress", /\b(dress|gaun|jumpsuit|romper|overalls)\b/i],
  [
    "outerwear",
    /\b(coat|jacket|blazer|jaket|cardigan|trench|mantel|parka|puffer)\b/i,
  ],
  [
    "shoes",
    /\b(shoes?|sneakers?|sandals?|sepatu|boots?|loafers?|heels?|cleats|mules)\b/i,
  ],
  [
    "accessory",
    /\b(bag|handbag|tote|tas|belt|sabuk|hat|topi|scarf|syal|jewel(?:ry|lery)|necklace|kalung|bracelet|gelang|watch|sunglasses)\b/i,
  ],
  [
    "bottom",
    /\b(pants?|trousers?|jeans|skirt|rok|celana|shorts|leggings?|culottes)\b/i,
  ],
  [
    "top",
    /\b(t[ -]?shirt|shirt|blouse|blus|baju|atasan|kemeja|kaos|jersey|sweater|hoodie|polo|tunic|tunik|camisole|tank|sweatshirt)\b/i,
  ],
];

export function supportedCategory(title: string): Category | null {
  if (
    /\b(cleaner|cleaning kit|shoe rack|hanger|phone case|miniature|sewing pattern|replacement sole)\b/i.test(
      title,
    )
  )
    return null;
  return (
    categoryPatterns.find(([, pattern]) => pattern.test(title))?.[0] ?? null
  );
}

export function publicHttpsUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      !url.hostname.includes(".") ||
      /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(url.hostname)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function normalizeOffer(
  raw: unknown,
  category: Category,
  target: ShoppingTarget = null,
) {
  const parsed = offerSchema.safeParse(raw);
  if (!parsed.success) return null;
  const offer = parsed.data;
  if (
    !isShopeeSource(offer.source) ||
    !matchesShoppingTarget(offer.title, target) ||
    supportedCategory(offer.title) !== category
  )
    return null;
  const productUrl =
    publicHttpsUrl(offer.link) ?? publicHttpsUrl(offer.product_link);
  if (!productUrl) return null;
  const currency =
    offer.currency ??
    (/^\s*(?:Rp\.?|IDR)\s*/i.test(offer.price ?? "") ? "IDR" : null);
  let priceMinor: number | null = null;
  if (currency && offer.extracted_price != null) {
    try {
      // IDR has two ISO minor digits; ICU display defaults vary by runtime.
      const digits =
        currency === "IDR"
          ? 2
          : (new Intl.NumberFormat("en", {
              style: "currency",
              currency,
            }).resolvedOptions().maximumFractionDigits ?? 2);
      const value = Math.round(offer.extracted_price * 10 ** digits);
      if (Number.isSafeInteger(value)) priceMinor = value;
    } catch {
      /* Unsupported currency remains unpriced. */
    }
  }
  return {
    providerProductId: String(
      offer.product_id ?? createHash("sha256").update(productUrl).digest("hex"),
    ),
    title: offer.title,
    sourceLabel: offer.source,
    category,
    productUrl,
    imageUrl:
      publicHttpsUrl(offer.serpapi_thumbnail) ??
      publicHttpsUrl(offer.thumbnail),
    priceMinor,
    currency: priceMinor === null ? null : currency,
    rating: offer.rating ?? null,
    reviewCount: offer.reviews ?? null,
  };
}

export async function readBoundedResponse(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length")) > maxBytes)
    throw new ApiError(
      "PROVIDER_RESPONSE_TOO_LARGE",
      "The source response is too large.",
      502,
    );
  if (!response.body)
    throw new ApiError(
      "PROVIDER_RESPONSE_INVALID",
      "The source response is unavailable.",
      502,
    );
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes)
        throw new ApiError(
          "PROVIDER_RESPONSE_TOO_LARGE",
          "The source response is too large.",
          502,
        );
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

let active = 0;
const waiters: (() => void)[] = [];
async function withSearchCapacity<T>(task: () => Promise<T>): Promise<T> {
  if (active >= 3) {
    if (waiters.length >= 24)
      throw new ApiError(
        "SEARCH_BUSY",
        "Shopping searches are busy. Retry shortly.",
        429,
        true,
      );
    await new Promise<void>((resolve, reject) => {
      const waiter = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index !== -1) waiters.splice(index, 1);
        reject(
          new ApiError(
            "SEARCH_BUSY",
            "Shopping searches are busy. Retry shortly.",
            429,
            true,
          ),
        );
      }, 10_000);
      waiters.push(waiter);
    });
  } else active++;
  try {
    return await task();
  } finally {
    const next = waiters.shift();
    if (next) next();
    else active--;
  }
}

type ProviderResult = { results: unknown[]; retrievedAt: string };
const queryCache = new Map<
  string,
  { expires: number; promise: Promise<ProviderResult> }
>();
export async function searchSerpApi(
  workspaceId: string,
  query: string,
  apiKey: string,
  contextKey: string,
  beforeRequest?: () => Promise<void>,
): Promise<ProviderResult> {
  const key = `${workspaceId}:${contextKey}:${query.toLowerCase()}`;
  const previous = queryCache.get(key);
  if (previous && previous.expires > Date.now()) return previous.promise;
  const promise = withSearchCapacity(async () => {
    const url = new URL("https://serpapi.com/search.json");
    url.search = new URLSearchParams({
      engine: "google_shopping",
      q: query,
      gl: "id",
      hl: "id",
      google_domain: "google.co.id",
      api_key: apiKey,
    }).toString();
    try {
      await beforeRequest?.();
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
      });
      if (!response.ok)
        throw new ApiError(
          response.status === 429
            ? "SHOPPING_RATE_LIMITED"
            : "SHOPPING_PROVIDER_FAILED",
          "Shopping search is unavailable. Retry later.",
          503,
          true,
        );
      const bytes = await readBoundedResponse(response, 1024 * 1024);
      const body = z
        .object({
          error: z.string().max(4000).optional(),
          shopping_results: z.array(z.unknown()).max(200).optional(),
        })
        .safeParse(JSON.parse(new TextDecoder().decode(bytes)));
      if (!body.success || body.data.error)
        throw new ApiError(
          "SHOPPING_OUTPUT_INVALID",
          "Shopping search returned an unavailable response.",
          502,
          true,
        );
      return {
        results: (body.data.shopping_results ?? []).slice(0, 40),
        retrievedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        "SHOPPING_PROVIDER_FAILED",
        "Shopping search is unavailable. Retry later.",
        503,
        true,
      );
    }
  });
  if (queryCache.size >= 100)
    queryCache.delete(queryCache.keys().next().value ?? "");
  queryCache.set(key, { expires: Date.now() + 5 * 60_000, promise });
  try {
    return await promise;
  } catch (error) {
    queryCache.delete(key);
    throw error;
  }
}
