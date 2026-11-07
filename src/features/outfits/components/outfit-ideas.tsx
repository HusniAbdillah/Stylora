"use client";

import { useRef, useState } from "react";
import { Badge, Button, Chip, Icon } from "@/components/ui";

export type OutfitDirection = "closest" | "from_wardrobe" | "fresh_alternative";

export type OutfitIdeaPiece = {
  id: string;
  name: string;
  status: "owned" | "alternative" | "missing";
  imageUrl?: string | null;
};

export type OutfitIdea = {
  id: string;
  direction: OutfitDirection;
  status: "ready" | "regenerating" | "unavailable" | "failed";
  title?: string;
  concept?: string;
  pieces: OutfitIdeaPiece[];
  reasons: string[];
  inputsUsed?: string[];
  differences?: string[];
  uncertainty?: string[];
  errorMessage?: string;
};

export type OutfitIdeasProps = {
  ideas: OutfitIdea[];
  status?: "loading" | "ready" | "error" | "unavailable";
  preferencesUsed?: string[];
  hasPreferences?: boolean;
  onViewDetails?: (idea: OutfitIdea) => void;
  onSuggestAnother?: (idea: OutfitIdea) => void;
  onCancelRegeneration?: (idea: OutfitIdea) => void;
  onAddWardrobe?: () => void;
  onSetPreferences?: () => void;
  onRetry?: () => void;
};

const directionNames: Record<OutfitDirection, string> = {
  closest: "Closest to the inspiration",
  from_wardrobe: "From your wardrobe",
  fresh_alternative: "A fresh alternative",
};

function PieceImage({ piece }: { piece: OutfitIdeaPiece }) {
  return (
    <div
      className={`relative flex aspect-[1.08] min-w-0 items-center justify-center overflow-hidden rounded-xl ${piece.status === "missing" ? "bg-[var(--color-missing-bg)] text-[var(--color-missing)]" : "bg-sand text-secondary"}`}
    >
      {piece.imageUrl && piece.status !== "missing" ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={piece.imageUrl}
            alt={piece.name}
            className="size-full object-contain"
          />
        </>
      ) : (
        <div className="p-2 text-center text-xs">
          <Icon
            name={piece.status === "missing" ? "bag" : "image"}
            className="mx-auto mb-1 size-5"
          />
          {piece.status === "missing" ? "To find" : "Image unavailable"}
        </div>
      )}
    </div>
  );
}

export function OutfitIdeaCard({
  idea,
  onViewDetails,
  onSuggestAnother,
  onCancelRegeneration,
  onAddWardrobe,
}: {
  idea: OutfitIdea;
  onViewDetails?: () => void;
  onSuggestAnother?: () => void;
  onCancelRegeneration?: () => void;
  onAddWardrobe?: () => void;
}) {
  if (idea.status === "unavailable")
    return (
      <article className="flex min-h-[420px] flex-col rounded-[20px] border border-stone bg-porcelain p-4">
        <Badge tone="neutral">{directionNames[idea.direction]}</Badge>
        <div className="mt-6 flex h-32 items-center justify-center gap-2 rounded-xl bg-paper text-secondary">
          <Icon name="shirt" className="size-8" />
          <Icon name="plus" className="size-6" />
          <Icon name="shirt" className="size-8" />
        </div>
        <h3 className="mt-5 font-serif text-2xl">Not available yet</h3>
        <p className="mt-2 text-sm leading-6 text-secondary">
          {idea.errorMessage ??
            "Add a few pieces you own to discover ways to recreate this look with less shopping."}
        </p>
        {onAddWardrobe && (
          <Button
            type="button"
            variant="secondary"
            onClick={onAddWardrobe}
            className="mt-5 self-start"
          >
            Add wardrobe items
          </Button>
        )}
      </article>
    );

  return (
    <article className="relative flex h-full min-w-0 flex-col rounded-[20px] border border-stone bg-paper p-3 sm:p-4">
      <Badge tone="neutral" className="self-start bg-blush text-crimson">
        {directionNames[idea.direction]}
      </Badge>
      <div
        className="relative mt-3 grid grid-cols-2 gap-1.5"
        aria-label={`${idea.title ?? directionNames[idea.direction]} pieces`}
      >
        {idea.pieces.slice(0, 4).map((piece) => (
          <PieceImage key={piece.id} piece={piece} />
        ))}
        {idea.pieces.length === 0 && (
          <div className="col-span-2 flex h-48 items-center justify-center rounded-xl bg-porcelain text-sm text-secondary">
            Composition unavailable
          </div>
        )}
        {idea.status === "regenerating" && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-paper/70">
            <span className="inline-flex items-center gap-2 rounded-full bg-paper px-3 py-2 text-xs text-crimson shadow-sm">
              <Icon
                name="refresh"
                className="size-4 motion-safe:animate-spin"
              />
              Finding another idea
            </span>
          </div>
        )}
      </div>
      <h3 className="mt-4 font-serif text-[clamp(1.5rem,2vw,2rem)] leading-[1.15] tracking-tight">
        {idea.title ?? directionNames[idea.direction]}
      </h3>
      {idea.concept && (
        <p className="mt-2 text-sm leading-5 text-secondary">{idea.concept}</p>
      )}
      {idea.pieces.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs">
          {idea.pieces.map((piece) => (
            <li
              key={piece.id}
              className="flex items-start justify-between gap-2"
            >
              <span className="min-w-0 text-ink">{piece.name}</span>
              <span
                className={`inline-flex shrink-0 items-center gap-1 ${piece.status === "missing" ? "text-[var(--color-missing)]" : piece.status === "alternative" ? "text-[var(--color-alternative)]" : "text-[var(--color-owned)]"}`}
              >
                <Icon
                  name={
                    piece.status === "missing"
                      ? "bag"
                      : piece.status === "alternative"
                        ? "swap"
                        : "check"
                  }
                  className="size-3"
                />
                {piece.status === "missing"
                  ? "Missing"
                  : piece.status === "alternative"
                    ? "Alternative"
                    : "Owned"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 rounded-xl bg-porcelain p-3">
        <h4 className="text-sm font-semibold">Why this</h4>
        <ul className="mt-2 space-y-2">
          {idea.reasons.map((reason, index) => (
            <li
              key={`${index}-${reason}`}
              className="flex items-start gap-2 text-xs leading-5"
            >
              <Icon
                name="check"
                className="mt-0.5 size-3.5 shrink-0 text-[var(--color-owned)]"
              />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </div>
      {idea.inputsUsed?.length ? (
        <p className="mt-3 text-xs leading-5 text-secondary">
          Uses: {idea.inputsUsed.join(", ")}
        </p>
      ) : null}
      {idea.differences?.length ? (
        <p className="mt-2 text-xs leading-5 text-secondary">
          Changes: {idea.differences.join("; ")}
        </p>
      ) : null}
      {idea.uncertainty?.length ? (
        <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-secondary">
          <Icon name="info" className="mt-0.5 size-3.5 shrink-0" />
          {idea.uncertainty.join("; ")}
        </p>
      ) : null}
      {idea.status === "failed" && (
        <p className="mt-3 text-xs text-[var(--color-missing)]" role="alert">
          {idea.errorMessage ??
            "A new idea could not be generated. The previous idea stays available."}
        </p>
      )}
      <div className="mt-auto hidden items-center justify-between gap-2 pt-5 lg:flex">
        {idea.status === "regenerating" && onCancelRegeneration ? (
          <Button type="button" variant="quiet" onClick={onCancelRegeneration}>
            Cancel
          </Button>
        ) : onSuggestAnother ? (
          <Button type="button" variant="quiet" onClick={onSuggestAnother}>
            Suggest another
          </Button>
        ) : (
          <span />
        )}
        <Button
          type="button"
          variant="primary"
          onClick={onViewDetails}
          disabled={!onViewDetails}
        >
          View details
        </Button>
      </div>
      {onSuggestAnother && (
        <Button
          type="button"
          variant="quiet"
          onClick={onSuggestAnother}
          className="mt-4 self-start lg:hidden"
          disabled={idea.status === "regenerating"}
        >
          Suggest another
        </Button>
      )}
    </article>
  );
}

export function OutfitIdeas({
  ideas,
  status = "ready",
  preferencesUsed = [],
  hasPreferences = true,
  onViewDetails,
  onSuggestAnother,
  onCancelRegeneration,
  onAddWardrobe,
  onSetPreferences,
  onRetry,
}: OutfitIdeasProps) {
  const order: OutfitDirection[] = [
    "closest",
    "from_wardrobe",
    "fresh_alternative",
  ];
  const orderedIdeas = order.map(
    (direction) =>
      ideas.find((idea) => idea.direction === direction) ?? {
        id: `unavailable-${direction}`,
        direction,
        status: "unavailable" as const,
        pieces: [],
        reasons: [],
        errorMessage:
          direction === "from_wardrobe"
            ? "Add a few pieces you own to discover ways to recreate this look with less shopping."
            : "This direction is not available yet.",
      },
  );
  const [selected, setSelected] = useState<OutfitDirection>("closest");
  const active =
    orderedIdeas.find((idea) => idea.direction === selected) ?? orderedIdeas[0];
  const touchStartX = useRef(0);
  const changeBySwipe = (delta: number) => {
    if (Math.abs(delta) < 50 || !active) return;
    const index = order.indexOf(active.direction);
    setSelected(
      order[
        Math.min(order.length - 1, Math.max(0, index + (delta < 0 ? 1 : -1)))
      ],
    );
  };

  return (
    <section
      className="mx-auto w-full max-w-[1150px] pb-8"
      aria-labelledby="outfit-ideas-title"
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm font-semibold text-crimson">Step 4 of 5</p>
          <h1
            id="outfit-ideas-title"
            className="mt-2 font-serif text-[clamp(2.2rem,4vw,3.2rem)] leading-tight"
          >
            Three ways to <em className="text-crimson">wear it.</em>
          </h1>
          <p className="mt-2 max-w-[620px] text-base leading-6 text-secondary">
            Each idea explains why it works, what it uses from your wardrobe and
            what is still uncertain.
          </p>
        </div>
        {active && onViewDetails && (
          <div className="hidden text-right lg:block">
            <Button
              type="button"
              variant="primary"
              onClick={() => onViewDetails(active)}
            >
              Open{" "}
              {active.direction === "closest"
                ? "closest"
                : active.direction === "from_wardrobe"
                  ? "wardrobe"
                  : "fresh"}{" "}
              idea
            </Button>
            <p className="mt-2 text-xs text-secondary">
              Choose a direction to see its details
            </p>
          </div>
        )}
      </div>
      {preferencesUsed.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-full border border-stone bg-paper px-3 py-2 text-xs">
          <span className="flex items-center gap-1.5 text-secondary">
            <Icon name="sparkle" className="size-3.5 text-crimson" />
            Personalized with
          </span>
          {preferencesUsed.map((preference) => (
            <Chip key={preference} selected>
              {preference}
            </Chip>
          ))}
        </div>
      )}
      {status === "loading" && (
        <div className="grid gap-3 lg:grid-cols-3" aria-busy="true">
          {order.map((direction) => (
            <div
              key={direction}
              className="h-[580px] animate-pulse rounded-[20px] border border-stone bg-paper p-4 motion-reduce:animate-none"
            >
              <div className="h-5 w-1/2 rounded bg-sand" />
              <div className="mt-4 h-64 rounded-xl bg-sand" />
              <div className="mt-4 h-6 w-4/5 rounded bg-sand" />
            </div>
          ))}
        </div>
      )}
      {(status === "error" || status === "unavailable") && (
        <div
          className="rounded-[20px] border border-stone bg-paper p-6"
          role="alert"
        >
          <Icon name="info" className="size-6 text-crimson" />
          <h2 className="mt-3 font-serif text-2xl">
            Outfit ideas are unavailable
          </h2>
          <p className="mt-2 text-sm text-secondary">
            Your inspiration and matches are still here. Try again when ideas
            are available.
          </p>
          {status === "error" && onRetry && (
            <Button
              type="button"
              variant="secondary"
              onClick={onRetry}
              className="mt-4"
            >
              Retry ideas
            </Button>
          )}
        </div>
      )}
      {status === "ready" && (
        <>
          <div
            className="mb-4 flex gap-1.5 overflow-x-auto pb-1 lg:hidden"
            role="tablist"
            aria-label="Outfit directions"
          >
            {order.map((direction) => (
              <button
                key={direction}
                type="button"
                role="tab"
                aria-selected={active?.direction === direction}
                onClick={() => setSelected(direction)}
                className={`min-h-9 shrink-0 rounded-full border px-3 text-sm ${active?.direction === direction ? "border-crimson bg-blush font-medium text-ink" : "border-stone bg-paper text-ink"}`}
              >
                {direction === "closest"
                  ? "Closest"
                  : direction === "from_wardrobe"
                    ? "From your wardrobe"
                    : "Fresh"}
              </button>
            ))}
          </div>
          <div className="hidden gap-3 lg:grid lg:grid-cols-3">
            {orderedIdeas.map((idea) => (
              <OutfitIdeaCard
                key={idea.id}
                idea={idea}
                onViewDetails={
                  onViewDetails ? () => onViewDetails(idea) : undefined
                }
                onSuggestAnother={
                  onSuggestAnother ? () => onSuggestAnother(idea) : undefined
                }
                onCancelRegeneration={
                  onCancelRegeneration
                    ? () => onCancelRegeneration(idea)
                    : undefined
                }
                onAddWardrobe={onAddWardrobe}
              />
            ))}
          </div>
          {active && (
            <div
              className="lg:hidden"
              onTouchStart={(event) => {
                touchStartX.current = event.touches[0]?.clientX ?? 0;
              }}
              onTouchEnd={(event) =>
                changeBySwipe(
                  (event.changedTouches[0]?.clientX ?? 0) - touchStartX.current,
                )
              }
            >
              <OutfitIdeaCard
                idea={active}
                onSuggestAnother={
                  onSuggestAnother ? () => onSuggestAnother(active) : undefined
                }
                onCancelRegeneration={
                  onCancelRegeneration
                    ? () => onCancelRegeneration(active)
                    : undefined
                }
                onAddWardrobe={onAddWardrobe}
              />
              <div
                className="mt-4 flex justify-center gap-1.5"
                aria-label={`Idea ${order.indexOf(active.direction) + 1} of 3`}
              >
                {order.map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    onClick={() => setSelected(direction)}
                    aria-label={`Show ${directionNames[direction]}`}
                    className={`h-2 rounded-full ${active.direction === direction ? "w-6 bg-crimson" : "w-2 bg-stone"}`}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {status === "ready" && !hasPreferences && (
        <div className="mt-5 rounded-[20px] border border-rose-wash bg-blush p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Icon name="sliders" className="size-5 text-crimson" />
            Make these ideas more personal
          </h2>
          <p className="mt-2 text-sm leading-6 text-secondary">
            These ideas use the reference colors and silhouette. Add your
            preferences for more personal color and fit guidance.
          </p>
          {onSetPreferences && (
            <Button
              type="button"
              variant="primary"
              onClick={onSetPreferences}
              className="mt-4"
            >
              Set preferences
            </Button>
          )}
        </div>
      )}
      {status === "ready" && active && onViewDetails && (
        <div className="sticky bottom-0 -mx-4 mt-5 flex items-center justify-between gap-3 border-t border-stone bg-paper px-4 py-3 lg:hidden">
          <span className="text-sm text-crimson">Outfit ideas</span>
          <Button
            type="button"
            variant="primary"
            onClick={() => onViewDetails(active)}
            disabled={active.status === "unavailable"}
          >
            View details
          </Button>
        </div>
      )}
    </section>
  );
}
