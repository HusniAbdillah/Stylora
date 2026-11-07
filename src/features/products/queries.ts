import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/http";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
  type WorkspaceDatabase,
} from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { getPreferences } from "@/features/preferences/server";
import {
  categorySchema,
  defaultWeights,
  searchInputSchema,
  weightsSchema,
  type ScoreWeights,
} from "./schema";
import { normalizeOffer, searchSerpApi } from "./provider";
import { relevanceScore, scoreOffer, SCORE_VERSION } from "./score";
import {
  buildShoppingQuery,
  shoppingContextKey,
  shoppingPreferences,
  shoppingSearchFingerprint,
  type ShoppingPreferences,
} from "./search-context";

type Product = Database["public"]["Tables"]["products"]["Row"];
type Search = Database["public"]["Tables"]["shopping_searches"]["Row"];
type Slot = Database["public"]["Tables"]["outfit_option_items"]["Row"];

async function readShoppingPreferences() {
  try {
    const saved = await getPreferences();
    return shoppingPreferences(saved.preferences, saved.revision);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "preferences_not_found"
    )
      return shoppingPreferences({}, 0);
    throw new ApiError(
      "SHOPPING_PREFERENCES_UNAVAILABLE",
      "Shopping preferences could not be loaded. Retry later.",
      503,
      true,
    );
  }
}

function searchFingerprint(
  context: WorkspaceDatabase,
  lookId: string,
  option: { id: string; revision: number },
  slot: Slot,
  query: string,
  preferences: ShoppingPreferences,
) {
  return shoppingSearchFingerprint({
    workspace: context.workspaceId,
    lookId,
    option: option.id,
    revision: option.revision,
    slot: slot.slot_id,
    item: slot.id,
    itemRevision: slot.revision,
    brief: slot.missing_brief,
    query,
    preferences,
  });
}

function validId(value: unknown) {
  const result = z.uuid().safeParse(value);
  if (!result.success)
    throw new ApiError("RESOURCE_ID_INVALID", "Choose a valid resource.");
  return result.data;
}

function databaseFailure() {
  return new ApiError(
    "SHOPPING_DATABASE_FAILED",
    "Shopping data could not be saved. Retry later.",
    503,
    true,
  );
}
function notFound() {
  return new ApiError(
    "OUTFIT_NOT_FOUND",
    "The requested outfit is unavailable.",
    404,
  );
}

export function fingerprintId(fingerprint: string) {
  const hex = createHash("sha256")
    .update(fingerprint)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = "8";
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function readOption(
  context: WorkspaceDatabase,
  lookId: string,
  optionId: string,
) {
  const { client, workspaceId } = context;
  const { data: look, error: lookError } = await client
    .from("looks")
    .select("id,revision")
    .eq("workspace_id", workspaceId)
    .eq("id", lookId)
    .maybeSingle();
  if (lookError) throw databaseFailure();
  if (!look) throw notFound();
  const { data: option, error } = await client
    .from("outfit_options")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("look_id", lookId)
    .eq("id", optionId)
    .maybeSingle();
  if (error) throw databaseFailure();
  if (!option) throw notFound();
  if (option.source_revision !== look.revision || option.status !== "ready")
    throw new ApiError(
      "OUTFIT_STALE",
      "Refresh the outfit before searching.",
      409,
    );
  return option;
}

export function productDto(product: Product) {
  const catalogLink = /(^|\.)google\.[a-z.]+$/i.test(
    new URL(product.product_url).hostname,
  );
  return {
    id: product.id,
    revision: product.revision,
    title: product.title,
    category: product.category,
    description: product.description,
    sourceLabel: product.source_label,
    sourceType: product.source_type,
    productUrl: product.product_url,
    imageUrl: product.image_url,
    priceMinor: product.price_minor,
    shippingMinor: product.shipping_minor,
    currency: product.currency,
    rating: product.rating,
    reviewCount: product.review_count,
    retrievedAt: product.retrieved_at,
    destinationType: catalogLink ? "catalog" : "seller",
  };
}

async function searchDto(
  context: WorkspaceDatabase,
  search: Search,
  preferences: ShoppingPreferences,
  requestedWeights?: ScoreWeights,
) {
  const base = {
    id: search.id,
    contextKey: shoppingContextKey(preferences),
    preferenceRevision: preferences.revision,
    optionId: search.option_id,
    optionItemId: search.option_item_id,
    slotId: search.slot_id,
    optionRevision: search.option_revision,
    query: search.query,
    status: search.status,
    errorCode: search.error_code,
    scoreVersion: search.score_version,
    createdAt: search.created_at,
    retryable:
      search.status === "failed" ||
      search.status === "unavailable" ||
      (search.status === "running" &&
        Date.parse(search.created_at) < Date.now() - 120_000),
    retryKeyRequired: true,
  };
  if (search.status !== "succeeded") return { ...base, products: [] };
  const { data: results, error } = await context.client
    .from("shopping_results")
    .select("*")
    .eq("workspace_id", context.workspaceId)
    .eq("search_id", search.id)
    .order("position")
    .limit(20);
  if (error) throw databaseFailure();
  if (!results?.length) return { ...base, products: [] };
  const { data: products, error: productError } = await context.client
    .from("products")
    .select("*")
    .eq("workspace_id", context.workspaceId)
    .in(
      "id",
      results.map((result) => result.product_id),
    );
  if (productError || !products) throw databaseFailure();
  const currencies = [
    ...new Set(
      products
        .filter((product) => product.price_minor !== null && product.currency)
        .map((product) => product.currency),
    ),
  ];
  const comparableCurrency = currencies.length === 1 ? currencies[0] : null;
  const prices = products
    .filter(
      (product) =>
        product.currency === comparableCurrency && product.price_minor !== null,
    )
    .map((product) => product.price_minor!);
  const parsedWeights = weightsSchema.safeParse(search.score_weights);
  const weights =
    requestedWeights ??
    (parsedWeights.success ? parsedWeights.data : defaultWeights);
  return {
    ...base,
    weights,
    priceComparisonCurrency: comparableCurrency,
    limitations: [
      "Shipping is excluded when unavailable. Offers may change after retrieval.",
      "Price ranking is unavailable for mixed currencies or fewer than two known prices.",
    ],
    products: results.flatMap((result) => {
      const product = products.find((entry) => entry.id === result.product_id);
      if (!product) return [];
      const score = scoreOffer(
        {
          priceMinor: product.price_minor,
          currency: product.currency,
          rating: product.rating,
          relevance: relevanceScore(search.query, product.title),
        },
        prices,
        comparableCurrency,
        weights,
      );
      return [
        {
          ...productDto(product),
          position: result.position,
          ...score,
          relevanceEvidence:
            "Matched search words in the catalog title; functional suitability still needs review.",
        },
      ];
    }),
  };
}

export async function listLookProducts(
  lookIdInput: string,
  optionIdInput: string,
) {
  const lookId = validId(lookIdInput);
  const optionId = validId(optionIdInput);
  const context = getWorkspaceDatabase();
  const option = await readOption(context, lookId, optionId);
  const preferences = await readShoppingPreferences();
  const contextKey = shoppingContextKey(preferences);
  const { data: slots, error: slotError } = await context.client
    .from("outfit_option_items")
    .select("*")
    .eq("workspace_id", context.workspaceId)
    .eq("look_id", lookId)
    .eq("option_id", option.id)
    .eq("item_kind", "missing")
    .limit(20);
  if (slotError) throw databaseFailure();
  const { data: searches, error } = await context.client
    .from("shopping_searches")
    .select("*")
    .eq("workspace_id", context.workspaceId)
    .eq("look_id", lookId)
    .eq("option_id", optionId)
    .eq("option_revision", option.revision)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw databaseFailure();
  const latest = new Map<string, Search>();
  for (const search of searches ?? []) {
    const slot = slots?.find((item) => item.id === search.option_item_id);
    const category = categorySchema.safeParse(slot?.category);
    if (!slot || !category.success || latest.has(search.slot_id)) continue;
    const query = buildShoppingQuery(search.query, category.data, preferences);
    if (
      search.input_fingerprint ===
      searchFingerprint(context, lookId, option, slot, query, preferences)
    )
      latest.set(search.slot_id, search);
  }
  return {
    lookId,
    optionId,
    optionRevision: option.revision,
    contextKey,
    preferenceRevision: preferences.revision,
    searches: await Promise.all(
      [...latest.values()].map((search) =>
        searchDto(context, search, preferences),
      ),
    ),
  };
}

export async function searchLookSlot(lookIdInput: string, input: unknown) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const lookId = validId(lookIdInput);
  const parsed = searchInputSchema.safeParse(input);
  if (!parsed.success)
    throw new ApiError(
      "SHOPPING_INPUT_INVALID",
      "Choose a valid outfit slot and search priorities.",
    );
  const request = parsed.data;
  const option = await readOption(context, lookId, request.optionId);
  if (option.option_type === "from_wardrobe")
    throw new ApiError(
      "OWNED_ONLY_OUTFIT",
      "Shopping is unavailable for this owned-only outfit.",
      409,
    );
  const { data: slot, error: slotError } = await context.client
    .from("outfit_option_items")
    .select("*")
    .eq("workspace_id", context.workspaceId)
    .eq("look_id", lookId)
    .eq("option_id", option.id)
    .eq("id", request.optionItemId)
    .maybeSingle();
  if (slotError) throw databaseFailure();
  if (!slot) throw notFound();
  if (slot.item_kind !== "missing" || slot.wardrobe_item_id !== null)
    throw new ApiError(
      "SLOT_NOT_MISSING",
      "Search is available only for missing pieces.",
      409,
    );
  const category = categorySchema.safeParse(slot.category);
  if (
    !category.success ||
    (slot.requested_category && slot.requested_category !== slot.category)
  )
    throw new ApiError(
      "SLOT_CATEGORY_INVALID",
      "Review this piece before searching.",
      409,
    );
  const brief = z
    .object({
      name: z.string().max(160).optional(),
      description: z.string().max(600).optional(),
    })
    .safeParse(slot.missing_brief);
  const briefQuery = (
    request.query ??
    slot.requested_brief ??
    (brief.success ? (brief.data.description ?? brief.data.name) : undefined) ??
    ""
  )
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 240);
  if (briefQuery.length < 2)
    throw new ApiError(
      "SEARCH_BRIEF_MISSING",
      "Add a description for this missing piece.",
      409,
    );
  const weights = request.weights ?? defaultWeights;
  const preferences = await readShoppingPreferences();
  const contextKey = shoppingContextKey(preferences);
  const query = buildShoppingQuery(briefQuery, category.data, preferences);
  const fingerprint = searchFingerprint(
    context,
    lookId,
    option,
    slot,
    query,
    preferences,
  );
  const searchId = fingerprintId(
    `${fingerprint}:${request.retryKey ?? "initial"}`,
  );
  let cachedQuery = context.client
    .from("shopping_searches")
    .select("*")
    .eq("workspace_id", context.workspaceId)
    .eq("look_id", lookId)
    .eq("option_id", option.id)
    .eq("input_fingerprint", fingerprint);
  if (request.retryKey) cachedQuery = cachedQuery.eq("id", searchId);
  const { data: cached, error: cacheError } = await cachedQuery
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cacheError) throw databaseFailure();
  if (cached) return searchDto(context, cached, preferences, weights);
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  const { data: search, error: insertError } = await context.client
    .from("shopping_searches")
    .insert({
      id: searchId,
      workspace_id: context.workspaceId,
      look_id: lookId,
      option_id: option.id,
      option_item_id: slot.id,
      slot_id: slot.slot_id,
      option_revision: option.revision,
      query,
      provider: "serpapi",
      country: "id",
      input_fingerprint: fingerprint,
      score_weights: weights,
      score_version: SCORE_VERSION,
      status: apiKey ? "running" : "unavailable",
      error_code: apiKey ? null : "SHOPPING_NOT_CONFIGURED",
    })
    .select("*")
    .single();
  if (insertError?.code === "23505") {
    const { data: existing, error } = await context.client
      .from("shopping_searches")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .eq("look_id", lookId)
      .eq("option_id", option.id)
      .eq("id", searchId)
      .maybeSingle();
    if (error || !existing) throw databaseFailure();
    return searchDto(context, existing, preferences, weights);
  }
  if (insertError || !search) throw databaseFailure();
  if (!apiKey) return searchDto(context, search, preferences, weights);
  try {
    const { results: raw, retrievedAt: providerRetrievedAt } =
      await searchSerpApi(context.workspaceId, query, apiKey, contextKey);
    const offers = [
      ...new Map(
        raw
          .map((entry) =>
            normalizeOffer(entry, category.data, preferences.target),
          )
          .filter((entry) => entry !== null)
          .map((entry) => [entry.providerProductId, entry]),
      ).values(),
    ].slice(0, 20);
    const current = await readOption(context, lookId, option.id);
    if (shoppingContextKey(await readShoppingPreferences()) !== contextKey)
      throw new ApiError(
        "SHOPPING_PREFERENCES_CHANGED",
        "Shopping preferences changed. Refresh the results before choosing.",
        409,
      );
    if (current.revision !== option.revision)
      throw new ApiError(
        "OUTFIT_STALE",
        "The outfit changed. Refresh before searching.",
        409,
      );
    if (offers.length) {
      const retrievedAt = providerRetrievedAt;
      const { data: saved, error: saveError } = await context.client
        .from("products")
        .upsert(
          offers.map((offer) => ({
            workspace_id: context.workspaceId,
            provider: "serpapi",
            provider_product_id: offer.providerProductId,
            title: offer.title,
            description: offer.title.slice(0, 600),
            category: offer.category,
            source_label: offer.sourceLabel,
            product_url: offer.productUrl,
            image_url: offer.imageUrl,
            price_minor: offer.priceMinor,
            currency: offer.currency,
            shipping_minor: null,
            rating: offer.rating,
            review_count: offer.reviewCount,
            source_type: "live",
            retrieved_at: retrievedAt,
            attributes: {},
            provenance: {
              name: { source: "catalog", state: "reported" },
              category: {
                source: "derived",
                state: "inferred",
                evidence: "Category words in catalog title",
              },
            },
            uncertainty: [
              "Garment details and functional suitability require review.",
            ],
          })),
          { onConflict: "workspace_id,provider,provider_product_id" },
        )
        .select("*");
      if (saveError || !saved) throw databaseFailure();
      const currencies = [
        ...new Set(
          saved
            .filter(
              (product) => product.price_minor !== null && product.currency,
            )
            .map((product) => product.currency),
        ),
      ];
      const currency = currencies.length === 1 ? currencies[0] : null;
      const prices = saved
        .filter(
          (product) =>
            product.currency === currency && product.price_minor !== null,
        )
        .map((product) => product.price_minor!);
      const results = offers.map((offer, position) => {
        const product = saved.find(
          (row) => row.provider_product_id === offer.providerProductId,
        );
        if (!product) throw databaseFailure();
        const score = scoreOffer(
          {
            priceMinor: product.price_minor,
            currency: product.currency,
            rating: product.rating,
            relevance: relevanceScore(query, product.title),
          },
          prices,
          currency,
          weights,
        );
        return {
          workspace_id: context.workspaceId,
          search_id: search.id,
          product_id: product.id,
          position,
          value_score: score.valueScore,
          factors: {
            ...score.factors,
            normalizedWeights: score.normalizedWeights,
          },
          score_version: SCORE_VERSION,
          explanation:
            "Search-word overlap, available rating, and comparable price. Shipping and stock are not verified.",
        };
      });
      const { error } = await context.client
        .from("shopping_results")
        .insert(results);
      if (error) throw databaseFailure();
    }
    const { data: completed, error } = await context.client
      .from("shopping_searches")
      .update({ status: offers.length ? "succeeded" : "empty" })
      .eq("workspace_id", context.workspaceId)
      .eq("look_id", lookId)
      .eq("option_id", option.id)
      .eq("id", search.id)
      .eq("status", "running")
      .select("*")
      .single();
    if (error || !completed) throw databaseFailure();
    return searchDto(context, completed, preferences, weights);
  } catch (error) {
    const errorCode =
      error instanceof ApiError ? error.code : "SHOPPING_PROVIDER_FAILED";
    const { data: failed, error: updateError } = await context.client
      .from("shopping_searches")
      .update({ status: "failed", error_code: errorCode })
      .eq("workspace_id", context.workspaceId)
      .eq("look_id", lookId)
      .eq("option_id", option.id)
      .eq("id", search.id)
      .eq("status", "running")
      .select("*")
      .single();
    if (updateError || !failed) throw databaseFailure();
    return searchDto(context, failed, preferences, weights);
  }
}

export async function prefetchLookProducts(lookIdInput: string) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const lookId = validId(lookIdInput);
  const { data: look, error: lookError } = await context.client
    .from("looks")
    .select("id,revision")
    .eq("workspace_id", context.workspaceId)
    .eq("id", lookId)
    .maybeSingle();
  if (lookError) throw databaseFailure();
  if (!look) throw notFound();
  const { data: options, error } = await context.client
    .from("outfit_options")
    .select("id")
    .eq("workspace_id", context.workspaceId)
    .eq("look_id", lookId)
    .eq("source_revision", look.revision)
    .eq("status", "ready")
    .neq("option_type", "from_wardrobe")
    .limit(3);
  if (error) throw databaseFailure();
  const jobs: { optionId: string; optionItemId: string }[] = [];
  for (const option of options ?? []) {
    const { data: slots, error: slotError } = await context.client
      .from("outfit_option_items")
      .select("id")
      .eq("workspace_id", context.workspaceId)
      .eq("look_id", lookId)
      .eq("option_id", option.id)
      .eq("item_kind", "missing")
      .limit(20);
    if (slotError) throw databaseFailure();
    for (const slot of slots ?? [])
      jobs.push({ optionId: option.id, optionItemId: slot.id });
  }
  const outcomes: {
    optionId: string;
    optionItemId: string;
    status: string;
    searchId?: string;
    errorCode?: string;
  }[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, jobs.length) }, async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        try {
          const search = await searchLookSlot(lookId, job);
          outcomes.push({ ...job, status: search.status, searchId: search.id });
        } catch (error) {
          outcomes.push({
            ...job,
            status: "failed",
            errorCode:
              error instanceof ApiError ? error.code : "SHOPPING_FAILED",
          });
        }
      }
    }),
  );
  return { lookId, outcomes };
}

export async function attachProductCandidate(
  lookIdInput: string,
  input: unknown,
) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const lookId = validId(lookIdInput);
  const parsed = z
    .strictObject({
      optionId: z.uuid(),
      optionItemId: z.uuid(),
      searchId: z.uuid(),
      productId: z.uuid(),
      expectedOptionRevision: z.number().int().positive(),
    })
    .safeParse(input);
  if (!parsed.success)
    throw new ApiError(
      "CANDIDATE_INPUT_INVALID",
      "Choose a valid product and current outfit revision.",
    );
  const request = parsed.data;
  const shopping = await listLookProducts(lookId, request.optionId);
  if (
    !shopping.searches.some(
      (search) =>
        search.id === request.searchId && search.status === "succeeded",
    )
  )
    throw new ApiError(
      "SHOPPING_CONTEXT_STALE",
      "Shopping preferences or results changed. Refresh before choosing this product.",
      409,
      true,
    );
  const { data, error } = await context.client.rpc("attach_product_candidate", {
    p_workspace_id: context.workspaceId,
    p_look_id: lookId,
    p_option_id: request.optionId,
    p_option_item_id: request.optionItemId,
    p_search_id: request.searchId,
    p_product_id: request.productId,
    p_expected_option_revision: request.expectedOptionRevision,
  });
  if (error)
    throw new ApiError(
      "CANDIDATE_ATTACH_FAILED",
      "The outfit or search changed. Refresh before choosing this product.",
      409,
      true,
    );
  if (!data)
    throw new ApiError(
      "CANDIDATE_ATTACH_FAILED",
      "The product could not be attached.",
      503,
      true,
    );
  return {
    optionItemId: data.id,
    optionId: data.option_id,
    slotId: data.slot_id,
    productId: data.product_id,
    revision: data.revision,
  };
}
