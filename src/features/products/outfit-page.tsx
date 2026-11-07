"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Button, Stepper } from "@/components/ui";
import { BrowserApiError, requestData } from "@/lib/browser-api";
import {
  OutfitDetail,
  type OutfitDetailOption,
  type ProductOffer,
  type ValueWeights,
} from "./outfit-detail";
import { scoreOffer } from "./score";
import type { OutfitPageData } from "./page-data";

type Detail = NonNullable<OutfitPageData["detail"]>;
type Shopping = NonNullable<OutfitPageData["shopping"]>;
type Search = Shopping["searches"][number];
type Choice = { slotId: string; optionItemId: string };
type Draft = { revision?: number; choices?: Choice[]; weights?: ValueWeights };
type OptionState = { detail: Detail; shopping: Shopping };
type ImportState = "complete" | "pending" | "importing";

const inFlightSearches = new Map<string, Promise<Search>>();
const emptySnapshot = () => "";
const subscribeDrafts = (notify: () => void) => {
  window.addEventListener("stylora-outfit-draft", notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener("stylora-outfit-draft", notify);
    window.removeEventListener("storage", notify);
  };
};
function readDrafts(key: string) {
  try {
    const value = sessionStorage.getItem(key) ?? "";
    return value.length <= 64_000 ? value : "";
  } catch {
    return "";
  }
}
function parseDrafts(raw: string): Record<string, Draft> {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result: Record<string, Draft> = {};
    for (const [key, entry] of Object.entries(value).slice(0, 20)) {
      if (!/^[a-f0-9-]{36}$/i.test(key)) continue;
      const row = object(entry);
      const weights = object(row.weights);
      const draft: Draft = {};
      if (
        typeof row.revision === "number" &&
        Number.isInteger(row.revision) &&
        row.revision > 0
      )
        draft.revision = row.revision;
      if (
        Array.isArray(row.choices) &&
        row.choices.length <= 20 &&
        row.choices.every(
          (choice) =>
            typeof object(choice).slotId === "string" &&
            text(object(choice).slotId).length <= 80 &&
            /^[a-f0-9-]{36}$/i.test(text(object(choice).optionItemId)),
        )
      )
        draft.choices = row.choices.map((choice) => ({
          slotId: text(object(choice).slotId),
          optionItemId: text(object(choice).optionItemId),
        }));
      if (
        [weights.price, weights.rating, weights.relevance].every(
          (amount) =>
            typeof amount === "number" &&
            Number.isFinite(amount) &&
            amount >= 0 &&
            amount <= 100,
        )
      )
        draft.weights = {
          price: Number(weights.price),
          rating: Number(weights.rating),
          relevance: Number(weights.relevance),
        };
      result[key] = draft;
    }
    return result;
  } catch {
    return {};
  }
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function sentences(value: unknown): string[] {
  if (typeof value === "string") return value ? [value] : [];
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) =>
    typeof entry === "string"
      ? [entry]
      : text(object(entry).reason)
        ? [text(object(entry).reason)]
        : [],
  );
}
function selectionChoices(detail: Detail, draft?: Draft): Choice[] {
  const saved = detail.selection?.choices ?? [];
  return detail.slots.flatMap((slot) => {
    const proposed =
      draft?.revision === detail.option.revision && Array.isArray(draft.choices)
        ? draft.choices.find((choice) => choice.slotId === slot.slotId)
            ?.optionItemId
        : undefined;
    const previous = saved.find(
      (choice) => choice.slotId === slot.slotId,
    )?.optionItemId;
    const candidate =
      slot.candidates.find(
        (item) =>
          item.optionItemId === (proposed ?? previous) && item.available,
      ) ?? slot.candidates.find((item) => item.available);
    return candidate && typeof candidate.optionItemId === "string"
      ? [{ slotId: slot.slotId, optionItemId: candidate.optionItemId }]
      : [];
  });
}
function inputLabels(value: unknown): string[] {
  const labels: Record<string, string> = {
    reference: "Reference",
    wardrobe: "Wardrobe",
    occasion: "Occasion",
    undertone: "Undertone",
    skin_depth: "Skin tone",
    skinSwatchId: "Selected skin tone",
    bodyProfile: "Selected body profile",
    fit: "Fit preferences",
    preferences: "Selected preferences",
  };
  if (Array.isArray(value))
    return value.flatMap((entry) =>
      typeof entry === "string" && labels[entry] ? [labels[entry]] : [],
    );
  return Object.entries(object(value)).flatMap(([key, entry]) =>
    labels[key] && entry !== null && entry !== false && entry !== ""
      ? [labels[key]]
      : [],
  );
}

export function OutfitPage({
  data,
  writesEnabled,
}: {
  data: OutfitPageData;
  writesEnabled: boolean;
}) {
  const router = useRouter();
  const storageKey = `stylora.outfit.v1.${data.lookId}`;
  const draftSnapshot = useSyncExternalStore(
    subscribeDrafts,
    useCallback(() => readDrafts(storageKey), [storageKey]),
    emptySnapshot,
  );
  const drafts = useMemo(() => parseDrafts(draftSnapshot), [draftSnapshot]);
  const [activeId, setActiveId] = useState(data.activeOptionId);
  const [cache, setCache] = useState<Record<string, OptionState>>(() =>
    data.activeOptionId && data.detail
      ? {
          [data.activeOptionId]: {
            detail: data.detail,
            shopping: data.shopping ?? {
              lookId: data.lookId,
              optionId: data.activeOptionId,
              optionRevision: data.detail.option.revision,
              searches: [],
            },
          },
        }
      : {},
  );
  const cacheRef = useRef(cache);
  const [message, setMessage] = useState<string | null>(null);
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [searchStates, setSearchStates] = useState<
    Record<string, "loading" | "error">
  >({});
  const retryLocks = useRef(new Set<string>());
  const [imports, setImports] = useState<Record<string, ImportState>>(() =>
    Object.fromEntries(
      data.imports.map((entry) => [
        entry.productId,
        entry.complete ? "complete" : "pending",
      ]),
    ),
  );
  const mutationLock = useRef(false);

  const updateOption = useCallback(
    (id: string, update: (current: OptionState) => OptionState) => {
      const current = cacheRef.current;
      if (!current[id]) return;
      const next = { ...current, [id]: update(current[id]) };
      cacheRef.current = next;
      setCache(next);
    },
    [],
  );
  function storeDraft(id: string, patch: Draft) {
    const next = parseDrafts(readDrafts(storageKey));
    next[id] = { ...next[id], ...patch };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(next));
      window.dispatchEvent(new Event("stylora-outfit-draft"));
    } catch {
      setMessage(
        "Your browser could not retain this draft. Keep this page open until the choice is saved.",
      );
    }
  }
  const loadOption = useCallback(
    async (id: string) => {
      setLoadingIds((current) => [...new Set([...current, id])]);
      try {
        const [detail, shopping] = await Promise.all([
          requestData<Detail>(`/api/looks/${data.lookId}/options/${id}`),
          requestData<Shopping>(
            `/api/looks/${data.lookId}/products?optionId=${id}`,
          ),
        ]);
        const result = { detail, shopping };
        const next = { ...cacheRef.current, [id]: result };
        cacheRef.current = next;
        setCache(next);
        setSearchStates((current) =>
          Object.fromEntries(
            Object.entries(current).filter(
              ([key]) => !key.startsWith(`${id}:`),
            ),
          ),
        );
        return result;
      } finally {
        setLoadingIds((current) => current.filter((entry) => entry !== id));
      }
    },
    [data.lookId],
  );

  async function changeOption(id: string) {
    if (mutationLock.current) {
      setMessage("Finish the current choice before switching directions.");
      return;
    }
    setActiveId(id);
    setMessage(null);
    const url = new URL(window.location.href);
    url.searchParams.set("option_id", id);
    url.searchParams.delete("step");
    window.history.replaceState(null, "", url);
    if (!cacheRef.current[id]) {
      try {
        await loadOption(id);
      } catch (error) {
        setMessage(
          error instanceof BrowserApiError
            ? error.message
            : "This direction could not be loaded. Try again.",
        );
      }
    }
  }
  useEffect(() => {
    const restore = () => {
      const id = new URL(window.location.href).searchParams.get("option_id");
      if (id && data.options.some((option) => option.id === id)) {
        setActiveId(id);
        if (!cacheRef.current[id])
          loadOption(id).catch(() =>
            setMessage("This direction could not be restored. Try again."),
          );
      }
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [data.options, loadOption]);

  const active = activeId ? cache[activeId] : undefined;
  const revision = active?.detail.option.revision;
  useEffect(() => {
    if (!writesEnabled || !activeId || !revision) return;
    const state = cacheRef.current[activeId];
    if (
      !state ||
      state.detail.option.type === "from_wardrobe" ||
      state.detail.option.status !== "ready" ||
      state.detail.option.sourceRevision !== state.detail.look.revision
    )
      return;
    let mounted = true;
    const missing = state.detail.slots.filter(
      (slot) =>
        slot.candidates.some((candidate) => candidate.kind === "missing") &&
        !state.shopping.searches.some(
          (search) => search.slotId === slot.slotId,
        ),
    );
    let cursor = 0;
    const worker = async () => {
      while (cursor < missing.length) {
        const slot = missing[cursor++];
        const candidate = slot.candidates.find(
          (item) => item.kind === "missing",
        );
        const key = `${data.lookId}:${activeId}:${revision}:${slot.slotId}`;
        let pending = inFlightSearches.get(key);
        if (!pending) {
          pending = requestData<Search>(
            `/api/looks/${data.lookId}/products/search`,
            {
              method: "POST",
              body: JSON.stringify({
                optionId: activeId,
                optionItemId: candidate?.optionItemId,
              }),
            },
          );
          inFlightSearches.set(key, pending);
          pending
            .finally(() => inFlightSearches.delete(key))
            .catch(() => undefined);
        }
        try {
          const search = await pending;
          if (mounted)
            updateOption(activeId, (current) => ({
              ...current,
              shopping: {
                ...current.shopping,
                searches: [
                  ...current.shopping.searches.filter(
                    (entry) => entry.slotId !== slot.slotId,
                  ),
                  search,
                ],
              },
            }));
        } catch (error) {
          if (mounted) {
            setSearchStates((current) => ({
              ...current,
              [`${activeId}:${slot.slotId}`]: "error",
            }));
            setMessage(
              error instanceof BrowserApiError
                ? error.message
                : "One shopping search could not finish. Retry that piece.",
            );
          }
        }
      }
    };
    Promise.all(
      Array.from({ length: Math.min(3, missing.length) }, worker),
    ).catch(() => {
      if (mounted)
        setMessage(
          "Shopping search could not finish. Retry the missing piece.",
        );
    });
    return () => {
      mounted = false;
    };
  }, [activeId, revision, writesEnabled, data.lookId, updateOption]);

  useEffect(() => {
    if (
      !activeId ||
      !active?.shopping.searches.some((search) => search.status === "running")
    )
      return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let count = 0;
    const poll = async () => {
      try {
        const shopping = await requestData<Shopping>(
          `/api/looks/${data.lookId}/products?optionId=${activeId}`,
        );
        if (!cancelled)
          updateOption(activeId, (current) => ({ ...current, shopping }));
        if (
          !cancelled &&
          shopping.searches.some((search) => search.status === "running")
        ) {
          if (++count < 20) timer = setTimeout(poll, 2000);
          else
            setMessage(
              "The search is still pending. Refresh saved results to check its status. No extra search has been started.",
            );
        }
      } catch {
        if (!cancelled)
          setMessage(
            "Search status could not be refreshed. Your saved results are kept.",
          );
      }
    };
    timer = setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    activeId,
    active?.shopping.searches.some((search) => search.status === "running"),
    data.lookId,
    updateOption,
  ]);

  async function persistChoices(
    id: string,
    choices: Choice[],
    detail = cacheRef.current[id].detail,
  ) {
    storeDraft(id, { revision: detail.option.revision, choices });
    const selection = await requestData<{
      id: string;
      revision: number;
      sourceOptionRevision: number;
      choices: Choice[];
    }>(`/api/looks/${data.lookId}/selection`, {
      method: "PUT",
      body: JSON.stringify({
        optionId: id,
        expectedRevision: detail.selection?.revision ?? 0,
        choices,
      }),
    });
    updateOption(id, (current) => ({
      ...current,
      detail: {
        ...current.detail,
        selection: { ...selection, isStale: false },
      },
    }));
    return selection;
  }
  async function handleConflict(error: unknown, id: string) {
    if (error instanceof BrowserApiError && error.status === 409) {
      try {
        await loadOption(id);
      } catch {
        /* Keep the existing choice if refresh fails. */
      }
      setMessage(
        "This outfit changed. Your proposed choice is kept. Review the latest outfit and apply it again.",
      );
    } else
      setMessage(
        error instanceof BrowserApiError
          ? error.message
          : "The change could not be saved. Try again.",
      );
  }
  async function chooseProduct(offer: ProductOffer, slotId: string) {
    if (!writesEnabled || !activeId || mutationLock.current) return;
    const id = activeId;
    const state = cacheRef.current[id];
    const search = state.shopping.searches.find(
      (entry) => entry.slotId === slotId && entry.status === "succeeded",
    );
    const slot = state.detail.slots.find((entry) => entry.slotId === slotId);
    const missing = slot?.candidates.find((entry) => entry.kind === "missing");
    if (!search || !missing) return;
    mutationLock.current = true;
    setChoosing(offer.id);
    setMessage(null);
    try {
      const attached = await requestData<{ optionItemId: string }>(
        `/api/looks/${data.lookId}/products/attach`,
        {
          method: "POST",
          body: JSON.stringify({
            optionId: id,
            optionItemId: missing.optionItemId,
            searchId: search.id,
            productId: offer.id,
            expectedOptionRevision: state.detail.option.revision,
          }),
        },
      );
      const refreshed = await loadOption(id);
      const choices = selectionChoices(refreshed.detail, drafts[id]).map(
        (choice) =>
          choice.slotId === slotId
            ? { ...choice, optionItemId: attached.optionItemId }
            : choice,
      );
      await persistChoices(id, choices, refreshed.detail);
      setMessage("Choice saved. This product is still not owned.");
    } catch (error) {
      await handleConflict(error, id);
    } finally {
      mutationLock.current = false;
      setChoosing(null);
    }
  }
  async function importProduct(offer: ProductOffer) {
    if (!writesEnabled || !activeId || imports[offer.id] === "importing")
      return;
    const product = cacheRef.current[activeId].shopping.searches
      .flatMap((search) => search.products)
      .find((entry) => entry.id === offer.id);
    if (!product) return;
    setImports((current) => ({ ...current, [offer.id]: "importing" }));
    try {
      const imported = await requestData<{ importStatus: string }>(
        `/api/products/${offer.id}/wardrobe`,
        {
          method: "POST",
          body: JSON.stringify({
            sourceRevision: product.revision,
            idempotencyKey: `product:${offer.id}`,
          }),
        },
      );
      const complete = imported.importStatus === "complete";
      setImports((current) => ({
        ...current,
        [offer.id]: complete ? "complete" : "pending",
      }));
      setMessage(
        complete
          ? "Saved to Wardrobe as a candidate. Mark it owned only after you own it."
          : "The candidate is saved, but its image could not be copied. Retry the image import.",
      );
    } catch (error) {
      setImports((current) => ({ ...current, [offer.id]: "pending" }));
      setMessage(
        error instanceof BrowserApiError
          ? error.message
          : "The image import could not finish. Retry it.",
      );
    }
  }
  async function retrySearch(slotId: string) {
    if (!writesEnabled || !activeId) return;
    const id = activeId;
    const state = cacheRef.current[id];
    const candidate = state.detail.slots
      .find((slot) => slot.slotId === slotId)
      ?.candidates.find((item) => item.kind === "missing");
    if (!candidate) return;
    const lock = `${id}:${slotId}`;
    if (retryLocks.current.has(lock)) return;
    retryLocks.current.add(lock);
    setSearchStates((current) => ({ ...current, [lock]: "loading" }));
    try {
      const search = await requestData<Search>(
        `/api/looks/${data.lookId}/products/search`,
        {
          method: "POST",
          body: JSON.stringify({
            optionId: id,
            optionItemId: candidate.optionItemId,
            retryKey: crypto.randomUUID(),
          }),
        },
      );
      updateOption(id, (current) => ({
        ...current,
        shopping: {
          ...current.shopping,
          searches: [
            ...current.shopping.searches.filter(
              (entry) => entry.slotId !== slotId,
            ),
            search,
          ],
        },
      }));
      setSearchStates((current) => {
        const next = { ...current };
        delete next[lock];
        return next;
      });
    } catch (error) {
      setSearchStates((current) => ({ ...current, [lock]: "error" }));
      await handleConflict(error, id);
    } finally {
      retryLocks.current.delete(lock);
    }
  }
  async function saveLook() {
    if (!writesEnabled || !activeId || mutationLock.current) return;
    const id = activeId;
    const state = cacheRef.current[id];
    if (!state) return;
    if (
      (drafts[id]?.choices &&
        drafts[id].revision !== state.detail.option.revision) ||
      state.detail.selection?.isStale ||
      state.detail.option.sourceRevision !== state.detail.look.revision
    ) {
      setMessage(
        "This direction changed. Review the latest pieces and choose again before saving.",
      );
      return;
    }
    mutationLock.current = true;
    setSaving(true);
    setMessage(null);
    try {
      const choices = selectionChoices(state.detail, drafts[id]);
      if (
        choices.length !== state.detail.slots.length ||
        state.detail.selection?.isStale ||
        state.detail.option.sourceRevision !== state.detail.look.revision
      )
        throw new Error("Review the current outfit before saving.");
      let revision = state.detail.selection?.revision ?? 0;
      if (
        !revision ||
        choices.some(
          (choice) =>
            !state.detail.selection?.choices.some(
              (existing) =>
                existing.slotId === choice.slotId &&
                existing.optionItemId === choice.optionItemId,
            ),
        )
      )
        revision = (await persistChoices(id, choices)).revision;
      const saved = await requestData<{ id: string }>(
        `/api/looks/${data.lookId}/save`,
        {
          method: "POST",
          body: JSON.stringify({
            optionId: id,
            expectedRevision: revision,
            idempotencyKey: `outfit:${data.lookId}:${id}:${revision}`,
            title: state.detail.option.title,
          }),
        },
      );
      router.push(`/saved-looks/${saved.id}`);
    } catch (error) {
      await handleConflict(error, id);
    } finally {
      mutationLock.current = false;
      setSaving(false);
    }
  }

  const effectiveWeights = activeId && drafts[activeId]?.weights;
  const storedWeights = object(
    object(
      active?.shopping.searches.find((search) => search.status === "succeeded"),
    ).weights,
  );
  const defaultDisplayWeights = [
    storedWeights.price,
    storedWeights.rating,
    storedWeights.relevance,
  ].every(
    (value) =>
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 1,
  )
    ? {
        price: Number(storedWeights.price) * 100,
        rating: Number(storedWeights.rating) * 100,
        relevance: Number(storedWeights.relevance) * 100,
      }
    : { price: 30, rating: 20, relevance: 50 };
  const weights =
    effectiveWeights &&
    [
      effectiveWeights.price,
      effectiveWeights.rating,
      effectiveWeights.relevance,
    ].every((value) => Number.isFinite(value) && value >= 0 && value <= 100) &&
    effectiveWeights.price +
      effectiveWeights.rating +
      effectiveWeights.relevance >
      0
      ? effectiveWeights
      : defaultDisplayWeights;
  const options: OutfitDetailOption[] = data.options.map((option) => {
    const state = cache[option.id];
    const detail = state?.detail;
    const explanation = object(detail?.option.explanation);
    const choices = detail ? selectionChoices(detail, drafts[option.id]) : [];
    return {
      id: option.id,
      type: option.type,
      title: detail?.option.title ?? option.title,
      unavailable: option.status !== "ready",
      subtitle:
        detail?.option.concept ||
        "Results and choices are kept separately for each direction.",
      items:
        detail?.slots.flatMap((slot) => {
          const selected = choices.find(
            (choice) => choice.slotId === slot.slotId,
          )?.optionItemId;
          const candidate = slot.candidates.find(
            (item) => item.optionItemId === selected,
          );
          return candidate
            ? [
                {
                  id: slot.slotId,
                  name: text(candidate.name) || "Missing item",
                  category: slot.category,
                  imageUrl:
                    typeof candidate.imageUrl === "string"
                      ? candidate.imageUrl
                      : null,
                  status:
                    candidate.kind === "owned" && candidate.owned === true
                      ? ("owned" as const)
                      : candidate.kind === "product"
                        ? ("candidate" as const)
                        : ("missing" as const),
                },
              ]
            : [];
        }) ?? [],
      reasons: sentences(explanation.reasons).length
        ? sentences(explanation.reasons)
        : sentences(detail?.option.rationale),
      inputsUsed: inputLabels(detail?.option.inputsUsed),
      differences: sentences(explanation.differences),
      uncertainty: sentences(detail?.option.uncertainty),
      shoppingSlots:
        !detail || detail.option.type === "from_wardrobe"
          ? []
          : detail.slots
              .filter((slot) =>
                slot.candidates.some(
                  (candidate) => candidate.kind === "missing",
                ),
              )
              .map((slot) => {
                const search = state.shopping.searches.find(
                  (entry) => entry.slotId === slot.slotId,
                );
                const products = search?.products ?? [];
                const currencies = [
                  ...new Set(
                    products
                      .filter(
                        (product) =>
                          product.priceMinor !== null && product.currency,
                      )
                      .map((product) => product.currency),
                  ),
                ];
                const currency = currencies.length === 1 ? currencies[0] : null;
                const prices = products
                  .filter(
                    (product) =>
                      product.currency === currency &&
                      product.priceMinor !== null,
                  )
                  .map((product) => product.priceMinor!);
                const chosen = slot.candidates.find(
                  (candidate) =>
                    candidate.optionItemId ===
                    choices.find((choice) => choice.slotId === slot.slotId)
                      ?.optionItemId,
                );
                const missing = slot.candidates.find(
                  (candidate) => candidate.kind === "missing",
                );
                return {
                  id: slot.slotId,
                  name: text(missing?.name),
                  brief:
                    text(missing?.requestedBrief) ||
                    text(missing?.description) ||
                    text(missing?.name),
                  status:
                    searchStates[`${option.id}:${slot.slotId}`] ??
                    (!search
                      ? writesEnabled
                        ? ("loading" as const)
                        : ("unavailable" as const)
                      : search.status === "succeeded"
                        ? ("ready" as const)
                        : search.status === "running"
                          ? search.retryable
                            ? ("error" as const)
                            : ("loading" as const)
                          : search.status === "failed"
                            ? ("error" as const)
                            : search.status === "empty"
                              ? ("empty" as const)
                              : ("unavailable" as const)),
                  source: "Google Shopping via SerpAPI",
                  selectedOfferId: text(chosen?.productId) || null,
                  retrievedAt: products[0]?.retrievedAt
                    ? new Date(products[0].retrievedAt).toLocaleString("en", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "UTC",
                      }) + " UTC"
                    : undefined,
                  offers: products
                    .map((product) => {
                      const score = scoreOffer(
                        {
                          priceMinor: product.priceMinor,
                          currency: product.currency,
                          rating: product.rating,
                          relevance: product.factors.relevance,
                        },
                        prices,
                        currency,
                        {
                          price: weights.price / 100,
                          rating: weights.rating / 100,
                          relevance: weights.relevance / 100,
                        },
                      );
                      return {
                        id: product.id,
                        title: product.title,
                        seller: product.sourceLabel,
                        url: product.productUrl,
                        imageUrl: product.imageUrl,
                        priceMinor: product.priceMinor,
                        currency: product.currency,
                        rating: product.rating,
                        reviewCount: product.reviewCount,
                        valueScore: score.valueScore,
                        valueFactors: score.factors,
                        scoreVersion: product.scoreVersion,
                        destinationType: product.destinationType,
                        savedCandidate: imports[product.id] === "complete",
                        importing: imports[product.id] === "importing",
                        importPending: imports[product.id] === "pending",
                        choosing: choosing !== null,
                      };
                    })
                    .sort(
                      (a, b) => (b.valueScore ?? -1) - (a.valueScore ?? -1),
                    ),
                };
              }),
    };
  });
  const backHref = `/looks/${data.lookId}?step=ideas`;
  if (!data.options.length || !activeId)
    return (
      <section className="rounded-2xl border border-stone bg-paper p-6">
        <h1 className="font-serif text-3xl">
          Your outfit ideas are not ready yet
        </h1>
        <p className="mt-3 text-sm text-secondary">
          Return to the inspiration flow to prepare an outfit direction. Your
          saved work is kept.
        </p>
        <Link
          href={backHref}
          className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-crimson hover:underline"
        >
          Return to outfit ideas
        </Link>
      </section>
    );
  return (
    <>
      <div className="mb-5">
        <Stepper
          current={4}
          visited={[0, 1, 2, 3, 4]}
          onSelect={(index) => {
            const url = new URL(window.location.href);
            url.searchParams.delete("option_id");
            url.searchParams.set(
              "step",
              ["upload", "review", "matches", "ideas", "details"][index],
            );
            router.push(url.pathname + url.search);
          }}
        />
      </div>
      {!writesEnabled && (
        <p className="mb-4 rounded-xl bg-blush p-4 text-sm">
          This workspace is read only. You can review saved results; shopping,
          choices and saving are paused.
        </p>
      )}
      {message && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-stone bg-paper p-4 text-sm"
        >
          <p>{message}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="quiet"
              onClick={() =>
                loadOption(activeId).catch(() =>
                  setMessage(
                    "The latest outfit could not be loaded. Try again.",
                  ),
                )
              }
            >
              Refresh saved results
            </Button>
            {writesEnabled &&
              active &&
              drafts[activeId]?.choices &&
              drafts[activeId].revision === active.detail.option.revision && (
                <Button
                  variant="secondary"
                  disabled={saving || choosing !== null}
                  onClick={async () => {
                    try {
                      await persistChoices(
                        activeId,
                        selectionChoices(active.detail, drafts[activeId]),
                      );
                      setMessage("Your reviewed choice is saved.");
                    } catch (error) {
                      await handleConflict(error, activeId);
                    }
                  }}
                >
                  Apply reviewed choice
                </Button>
              )}
          </div>
        </div>
      )}
      <OutfitDetail
        options={options}
        selectedOptionId={activeId}
        weights={weights}
        saving={saving || choosing !== null}
        loading={!active || loadingIds.includes(activeId)}
        backHref={backHref}
        onSelectOption={changeOption}
        onSaveLook={
          writesEnabled && active && active.detail.option.status === "ready"
            ? saveLook
            : undefined
        }
        onSaveProduct={writesEnabled ? importProduct : undefined}
        onChooseProduct={writesEnabled ? chooseProduct : undefined}
        onRetrySearch={writesEnabled ? retrySearch : undefined}
        onWeightsChange={(next) => {
          if (next.price + next.rating + next.relevance > 0)
            storeDraft(activeId, { weights: next });
          else setMessage("Keep at least one value priority above zero.");
        }}
      />
    </>
  );
}
