"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Chip, Icon } from "@/components/ui";

export type OutfitItem = {
  id: string;
  name: string;
  imageUrl?: string | null;
  category: string;
  status: "owned" | "alternative" | "missing" | "candidate";
};

export type ProductOffer = {
  id: string;
  title: string;
  seller: string;
  url: string;
  imageUrl?: string | null;
  priceMinor?: number | null;
  currency?: string | null;
  minorUnitDigits?: number;
  rating?: number | null;
  reviewCount?: number | null;
  valueScore?: number | null;
  valueFactors?: {
    price?: number | null;
    rating?: number | null;
    relevance?: number | null;
  };
  scoreVersion?: string;
  savedCandidate?: boolean;
  importing?: boolean;
  choosing?: boolean;
  importPending?: boolean;
  destinationType?: string;
};

export type ShoppingSlot = {
  id: string;
  name: string;
  brief: string;
  status: "loading" | "ready" | "empty" | "error" | "unavailable";
  offers: ProductOffer[];
  selectedOfferId?: string | null;
  source?: string;
  retrievedAt?: string;
};

export type OutfitDetailOption = {
  id: string;
  type: "closest" | "from_wardrobe" | "fresh_alternative";
  title: string;
  subtitle?: string;
  items: OutfitItem[];
  reasons: string[];
  inputsUsed: string[];
  differences?: string[];
  uncertainty?: string[];
  shoppingSlots: ShoppingSlot[];
  unavailable?: boolean;
};

export type ValueWeights = { price: number; rating: number; relevance: number };

const OPTION_LABELS: Record<OutfitDetailOption["type"], string> = {
  closest: "Closest to the inspiration",
  from_wardrobe: "From your wardrobe",
  fresh_alternative: "A fresh alternative",
};

function ProductPicture({ src, alt }: { src?: string | null; alt: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-sand">
      {src && src !== failedSrc ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 640px) 160px, 240px"
          unoptimized
          onError={() => setFailedSrc(src)}
          className="object-contain"
        />
      ) : (
        <span className="flex h-full items-center justify-center gap-2 text-xs text-secondary">
          <Icon name="image" className="size-5" /> Image unavailable
        </span>
      )}
    </div>
  );
}

function formatPrice(offer: ProductOffer) {
  if (offer.priceMinor == null || !offer.currency) return "Price unavailable";
  try {
    const currency = offer.currency.toUpperCase();
    const currencyFormatter = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    });
    const defaultDigits =
      currency === "IDR"
        ? 2
        : (currencyFormatter.resolvedOptions().maximumFractionDigits ?? 2);
    const digits =
      offer.minorUnitDigits != null &&
      Number.isInteger(offer.minorUnitDigits) &&
      offer.minorUnitDigits >= 0 &&
      offer.minorUnitDigits <= 3
        ? offer.minorUnitDigits
        : defaultDigits;
    const amount = offer.priceMinor / 10 ** digits;
    const wholeRupiah = currency === "IDR" && Number.isInteger(amount);
    const formatter = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      minimumFractionDigits: wholeRupiah ? 0 : digits,
      maximumFractionDigits: wholeRupiah ? 0 : digits,
    });
    return formatter.format(amount);
  } catch {
    return "Price unavailable";
  }
}

export function ProductCard({
  offer,
  selected,
  onSave,
  onChoose,
}: {
  offer: ProductOffer;
  selected?: boolean;
  onSave?: (offer: ProductOffer) => void;
  onChoose?: (offer: ProductOffer) => void;
}) {
  return (
    <article
      className={
        "flex min-w-40 flex-col rounded-2xl border bg-porcelain p-2.5 sm:min-w-0 " +
        (selected ? "border-crimson" : "border-transparent")
      }
    >
      <ProductPicture src={offer.imageUrl} alt={offer.title} />
      <div className="flex flex-1 flex-col px-0.5 pt-2">
        <p className="text-xs text-secondary">{offer.seller}</p>
        <h4 className="mt-1 line-clamp-2 text-sm font-medium leading-snug">
          {offer.title}
        </h4>
        <p className="mt-1 text-sm font-semibold">{formatPrice(offer)}</p>
        <p className="mt-1 text-xs text-secondary">
          {offer.rating == null
            ? "No rating returned"
            : offer.reviewCount == null
              ? "Rated " + offer.rating.toFixed(1)
              : "Rated " +
                offer.rating.toFixed(1) +
                " · " +
                offer.reviewCount +
                " reviews"}
        </p>
        {offer.valueScore != null && (
          <details className="mt-1 text-xs">
            <summary className="cursor-pointer font-medium text-crimson">
              Value score {offer.valueScore.toFixed(2)}
            </summary>
            <p className="mt-1 text-secondary">
              Available evidence: price{" "}
              {offer.valueFactors?.price == null
                ? "unknown"
                : offer.valueFactors.price.toFixed(2)}
              , rating{" "}
              {offer.valueFactors?.rating == null
                ? "unknown"
                : offer.valueFactors.rating.toFixed(2)}
              , relevance{" "}
              {offer.valueFactors?.relevance == null
                ? "unknown"
                : offer.valueFactors.relevance.toFixed(2)}
              {offer.scoreVersion ? ". Version " + offer.scoreVersion : ""}.
            </p>
          </details>
        )}
        <div className="mt-auto flex flex-col gap-2 pt-3">
          <Button
            variant="secondary"
            onClick={() => onSave?.(offer)}
            disabled={offer.savedCandidate || offer.importing || !onSave}
          >
            {offer.importing
              ? "Copying image…"
              : offer.savedCandidate
                ? "Saved as candidate"
                : offer.importPending
                  ? "Retry image import"
                  : "Save to wardrobe"}
          </Button>
          {onChoose && (
            <Button
              variant="quiet"
              onClick={() => onChoose(offer)}
              disabled={selected || offer.choosing}
            >
              {offer.choosing
                ? "Applying choice…"
                : selected
                  ? "Selected for this piece"
                  : "Choose for this piece"}
            </Button>
          )}
          <a
            href={offer.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-crimson hover:underline"
          >
            {offer.destinationType === "catalog"
              ? "Open catalog"
              : "Visit store"}{" "}
            <Icon name="external" className="size-4" />
          </a>
        </div>
      </div>
    </article>
  );
}

export function ShoppingSection({
  slot,
  weights,
  onWeightsChange,
  onRetry,
  onSaveProduct,
  onChooseProduct,
}: {
  slot: ShoppingSlot;
  weights: ValueWeights;
  onWeightsChange?: (weights: ValueWeights) => void;
  onRetry?: (slotId: string) => void;
  onSaveProduct?: (offer: ProductOffer, slotId: string) => void;
  onChooseProduct?: (offer: ProductOffer, slotId: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-rose-wash bg-paper p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blush text-crimson">
            <Icon name="bag" className="size-4" />
          </span>
          <div>
            <h3 className="font-serif text-2xl">Find the missing piece</h3>
            <p className="mt-1 text-sm text-secondary">
              {slot.brief || slot.name}
            </p>
          </div>
        </div>
        <Badge tone="missing">Missing</Badge>
      </div>
      {slot.status === "loading" ? (
        <div
          role="status"
          className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-72 animate-pulse rounded-2xl bg-sand motion-reduce:animate-none"
            />
          ))}
          <span className="sr-only">Searching for matching products</span>
        </div>
      ) : slot.status === "ready" && slot.offers.length ? (
        <>
          <p className="mt-4 text-xs text-secondary">
            {slot.offers.length} results
            {slot.source ? " from " + slot.source : ""}
            {slot.retrievedAt ? " · Retrieved " + slot.retrievedAt : ""}
          </p>
          <details className="mt-3 rounded-xl bg-porcelain px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium">
              Value score weights · Price {weights.price} · Rating{" "}
              {weights.rating} · Relevance {weights.relevance}
            </summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {(["price", "rating", "relevance"] as const).map((key) => (
                <label key={key} className="flex flex-col gap-1 capitalize">
                  {key}
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={weights[key]}
                    onChange={(event) =>
                      onWeightsChange?.({
                        ...weights,
                        [key]: Math.max(
                          0,
                          Math.min(100, Number(event.target.value)),
                        ),
                      })
                    }
                    className="h-11 w-full rounded-lg border border-stone bg-paper px-2"
                  />
                </label>
              ))}
            </div>
            <p className="mt-2 text-secondary">
              Unavailable factors are excluded. Price comparisons require the
              same currency.
            </p>
          </details>
          <div className="mt-4 flex snap-x gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible">
            {slot.offers.map((offer) => (
              <div
                key={offer.id}
                className="w-44 shrink-0 snap-start sm:w-auto"
              >
                <ProductCard
                  offer={offer}
                  selected={offer.id === slot.selectedOfferId}
                  onSave={
                    onSaveProduct
                      ? (item) => onSaveProduct(item, slot.id)
                      : undefined
                  }
                  onChoose={
                    onChooseProduct
                      ? (item) => onChooseProduct(item, slot.id)
                      : undefined
                  }
                />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-secondary">
            Saving a result adds it to Wardrobe as a candidate. It only counts
            as owned after you mark it owned.
          </p>
        </>
      ) : (
        <div className="mt-5 rounded-xl bg-porcelain p-5 text-sm text-secondary">
          <p>
            {slot.status === "error"
              ? "Shopping search could not finish."
              : slot.status === "unavailable"
                ? "Shopping search is unavailable."
                : "No suitable products were returned for this piece."}
          </p>
          {(slot.status === "error" ||
            slot.status === "empty" ||
            slot.status === "unavailable") &&
            onRetry && (
              <div className="mt-3">
                <Button variant="secondary" onClick={() => onRetry(slot.id)}>
                  Try search again
                </Button>
              </div>
            )}
        </div>
      )}
    </section>
  );
}

export function OutfitDetail({
  options,
  initialOptionId,
  selectedOptionId,
  weights,
  saving = false,
  loading = false,
  backHref,
  onSelectOption,
  onSaveLook,
  onWeightsChange,
  onRetrySearch,
  onSaveProduct,
  onChooseProduct,
}: {
  options: OutfitDetailOption[];
  initialOptionId?: string;
  selectedOptionId?: string;
  weights?: ValueWeights;
  saving?: boolean;
  loading?: boolean;
  backHref?: string;
  onSelectOption?: (optionId: string) => void;
  onSaveLook?: (optionId: string) => void;
  onWeightsChange?: (weights: ValueWeights) => void;
  onRetrySearch?: (slotId: string) => void;
  onSaveProduct?: (offer: ProductOffer, slotId: string) => void;
  onChooseProduct?: (offer: ProductOffer, slotId: string) => void;
}) {
  const [activeId, setActiveId] = useState(initialOptionId ?? options[0]?.id);
  const [localWeights, setLocalWeights] = useState<ValueWeights>(
    weights ?? { price: 30, rating: 20, relevance: 50 },
  );
  const active =
    options.find((option) => option.id === (selectedOptionId ?? activeId)) ??
    options[0];
  const effectiveWeights = weights ?? localWeights;
  function changeWeights(next: ValueWeights) {
    setLocalWeights(next);
    onWeightsChange?.(next);
  }
  if (!active) {
    return (
      <section className="rounded-2xl bg-paper p-8 text-secondary">
        Outfit details are not available yet.
      </section>
    );
  }

  return (
    <div className="space-y-5 pb-24 md:pb-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-crimson">Step 5 of 5</p>
          <h1 className="mt-2 max-w-2xl font-serif text-4xl leading-tight md:text-5xl">
            {active.title}
          </h1>
          {active.subtitle && (
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-secondary">
              {active.subtitle}
            </p>
          )}
        </div>
        <div className="hidden md:block">
          <Button
            variant="primary"
            disabled={saving || loading || active.unavailable || !onSaveLook}
            onClick={() => onSaveLook?.(active.id)}
          >
            {saving ? "Saving look…" : "Save this look"}
          </Button>
          <p className="mt-2 text-xs text-secondary">
            Saving queues your illustrative outfit image.
          </p>
        </div>
      </header>
      <div
        role="tablist"
        aria-label="Outfit directions"
        className="flex max-w-xl gap-1 overflow-x-auto rounded-xl border border-stone bg-paper p-1"
      >
        {options.map((option) => (
          <button
            key={option.id}
            role="tab"
            aria-selected={option.id === active.id}
            tabIndex={option.id === active.id ? 0 : -1}
            disabled={option.unavailable}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const tabs = [
                ...(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                  "[role=tab]:not(:disabled)",
                ) ?? []),
              ];
              const index = tabs.indexOf(event.currentTarget);
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : (index +
                        (event.key === "ArrowRight" ? 1 : -1) +
                        tabs.length) %
                      tabs.length;
              tabs[next]?.focus();
              tabs[next]?.click();
            }}
            onClick={() => {
              setActiveId(option.id);
              onSelectOption?.(option.id);
            }}
            className={
              "min-h-11 min-w-0 flex-1 rounded-lg px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-crimson disabled:opacity-50 " +
              (option.id === active.id
                ? "border-b-2 border-crimson bg-blush font-medium"
                : "hover:bg-porcelain")
            }
          >
            <span className="hidden sm:block">
              {OPTION_LABELS[option.type]}
            </span>
            <span className="sm:hidden">
              {option.type === "closest"
                ? "Closest"
                : option.type === "from_wardrobe"
                  ? "Wardrobe"
                  : "Fresh"}
            </span>
          </button>
        ))}
      </div>
      {loading ? (
        <div
          role="status"
          className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]"
        >
          <div className="h-96 rounded-2xl bg-sand" />
          <div className="h-64 rounded-2xl bg-sand" />
          <span className="sr-only">
            Loading the selected outfit and saved shopping results
          </span>
        </div>
      ) : active.unavailable ? (
        <section className="rounded-2xl border border-stone bg-paper p-6">
          <h2 className="font-serif text-2xl">This direction is unavailable</h2>
          <p className="mt-2 text-sm text-secondary">
            Choose another available direction. No outfit or product has been
            substituted.
          </p>
        </section>
      ) : (
        <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="contents">
            <div className="order-1 min-w-0 space-y-4 lg:col-start-1">
              {active.shoppingSlots.length ? (
                active.shoppingSlots.map((slot) => (
                  <ShoppingSection
                    key={slot.id}
                    slot={slot}
                    weights={effectiveWeights}
                    onWeightsChange={changeWeights}
                    onRetry={onRetrySearch}
                    onSaveProduct={onSaveProduct}
                    onChooseProduct={onChooseProduct}
                  />
                ))
              ) : (
                <div className="rounded-2xl border border-stone bg-paper p-6">
                  <h2 className="font-serif text-2xl">Everything is covered</h2>
                  <p className="mt-2 text-sm text-secondary">
                    This direction has no missing pieces to shop for.
                  </p>
                </div>
              )}
            </div>
            <section className="order-3 min-w-0 rounded-2xl border border-stone bg-paper p-4 sm:p-6 lg:col-start-1">
              <h2 className="font-serif text-2xl">Your outfit</h2>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {active.items.map((item) => (
                  <div key={item.id} className="min-w-0">
                    <ProductPicture src={item.imageUrl} alt={item.name} />
                    <p className="mt-1 line-clamp-2 text-xs font-medium">
                      {item.name}
                    </p>
                    <Badge
                      tone={
                        item.status === "owned"
                          ? "owned"
                          : item.status === "alternative"
                            ? "alternative"
                            : item.status === "missing"
                              ? "missing"
                              : "neutral"
                      }
                    >
                      {item.status === "candidate"
                        ? "Candidate, not owned"
                        : item.status === "owned"
                          ? "Owned"
                          : item.status === "alternative"
                            ? "Alternative"
                            : "Missing"}
                    </Badge>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <aside className="order-2 rounded-2xl border border-stone bg-paper p-5 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <h2 className="font-serif text-2xl">Why this</h2>
            <ul className="mt-3 space-y-3 text-sm leading-relaxed">
              {active.reasons.map((reason, index) => (
                <li key={index} className="flex gap-2">
                  <Icon
                    name="check"
                    className="mt-0.5 size-4 shrink-0 text-crimson"
                  />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
            {!active.reasons.length && (
              <p className="mt-3 text-sm text-secondary">
                No explanation was recorded for this direction.
              </p>
            )}
            {active.inputsUsed.length > 0 && (
              <>
                <h3 className="mt-5 text-xs font-medium text-secondary">
                  Inputs used
                </h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {active.inputsUsed.map((input) => (
                    <Chip key={input} selected>
                      {input}
                    </Chip>
                  ))}
                </div>
              </>
            )}
            {active.differences?.length ? (
              <>
                <h3 className="mt-5 text-xs font-medium text-secondary">
                  Differences
                </h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {active.differences.map((difference, index) => (
                    <li key={index}>{difference}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {active.uncertainty?.length ? (
              <div className="mt-5 rounded-xl bg-porcelain p-3 text-xs leading-relaxed text-secondary">
                <Icon name="info" className="mr-1 inline size-4" />
                {active.uncertainty.join(" ")}
              </div>
            ) : null}
          </aside>
        </div>
      )}
      {backHref && (
        <Link
          href={backHref}
          className="hidden min-h-11 items-center gap-2 text-sm font-medium text-crimson hover:underline md:inline-flex"
        >
          <Icon name="arrowLeft" className="size-4" />
          Back to outfit ideas
        </Link>
      )}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-stone bg-paper p-4 md:hidden">
        {backHref ? (
          <Link
            href={backHref}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-crimson"
          >
            <Icon name="arrowLeft" className="size-4" />
            Ideas
          </Link>
        ) : (
          <span className="text-sm text-secondary">Outfit details</span>
        )}
        <Button
          variant="primary"
          disabled={saving || loading || active.unavailable || !onSaveLook}
          onClick={() => onSaveLook?.(active.id)}
        >
          {saving ? "Saving…" : "Save this look"}
        </Button>
      </div>
    </div>
  );
}
