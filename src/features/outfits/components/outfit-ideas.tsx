"use client";

import { useId, useRef, useState } from "react";
import { Badge, Button, Chip, Icon } from "@/components/ui";
import styles from "./outfits.module.css";

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
  selectedDirection?: OutfitDirection;
  onSelectDirection?: (direction: OutfitDirection) => void;
  onBack?: () => void;
};

const directionNames: Record<OutfitDirection, string> = {
  closest: "Closest to the inspiration",
  from_wardrobe: "From your wardrobe",
  fresh_alternative: "A fresh alternative",
};

function PreferenceNotice({
  onSetPreferences,
}: {
  onSetPreferences?: () => void;
}) {
  return (
    <section className="rounded-[20px] border border-rose-wash bg-blush p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Icon name="sliders" className="size-5 text-crimson" /> Make these ideas
        more personal
      </h2>
      <p className="mt-2 text-sm leading-6 text-secondary">
        These ideas use the reference colors and silhouette. Add your
        preferences for more personal color and fit guidance.
      </p>
      {onSetPreferences && (
        <Button variant="primary" onClick={onSetPreferences} className="mt-4">
          Set preferences
        </Button>
      )}
    </section>
  );
}

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
  ideaNumber,
}: {
  idea: OutfitIdea;
  onViewDetails?: () => void;
  onSuggestAnother?: () => void;
  onCancelRegeneration?: () => void;
  onAddWardrobe?: () => void;
  ideaNumber?: number;
}) {
  const [compositionOpen, setCompositionOpen] = useState(false);
  const compositionId = useId();
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
            idea.concept ??
            (idea.direction === "from_wardrobe"
              ? "Add a few pieces you own to discover ways to recreate this look with less shopping."
              : "This direction is unavailable for the current inputs.")}
        </p>
        {onAddWardrobe && idea.direction === "from_wardrobe" && (
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
    <article className={styles.card} aria-busy={idea.status === "regenerating"}>
      <Badge
        tone="neutral"
        className="hidden self-start bg-blush text-crimson lg:inline-flex"
      >
        {directionNames[idea.direction]}
      </Badge>
      <div
        className={styles.collage}
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
      <h3 className={styles.cardTitle}>
        {idea.title ?? directionNames[idea.direction]}
      </h3>
      {(idea.concept || idea.pieces.length > 0) && (
        <div className={styles.composition} data-open={compositionOpen}>
          <button
            type="button"
            className="flex min-h-11 items-center gap-2 text-xs text-crimson lg:hidden"
            aria-expanded={compositionOpen}
            aria-controls={compositionId}
            onClick={() => setCompositionOpen((current) => !current)}
          >
            Pieces and concept <Icon name="chevron-down" className="size-3.5" />
          </button>
          <div id={compositionId} className={styles.compositionBody}>
            {idea.concept && (
              <p className="mt-2 text-sm leading-5 text-secondary">
                {idea.concept}
              </p>
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
            {idea.inputsUsed?.length ? (
              <p className="mt-3 text-xs leading-5 text-secondary lg:hidden">
                Uses: {idea.inputsUsed.join(", ")}
              </p>
            ) : null}
            {idea.differences?.length ? (
              <p className="mt-2 text-xs leading-5 text-secondary lg:hidden">
                Changes: {idea.differences.join("; ")}
              </p>
            ) : null}
          </div>
        </div>
      )}
      <div className={styles.reasons}>
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
        <p className="mt-3 hidden text-xs leading-5 text-secondary lg:block">
          Uses: {idea.inputsUsed.join(", ")}
        </p>
      ) : null}
      {idea.differences?.length ? (
        <p className="mt-2 hidden text-xs leading-5 text-secondary lg:block">
          Changes: {idea.differences.join("; ")}
        </p>
      ) : null}
      {idea.uncertainty?.length ? (
        <p className="order-3 mt-3 flex items-start gap-1.5 text-xs leading-5 text-secondary lg:order-none">
          <Icon name="info" className="mt-0.5 size-3.5 shrink-0" />
          {idea.uncertainty.join("; ")}
        </p>
      ) : null}
      {idea.status === "failed" && (
        <p
          className="order-5 mt-3 text-xs text-[var(--color-missing)] lg:order-none"
          role="alert"
        >
          {idea.errorMessage ??
            (idea.pieces.length
              ? "A new idea could not be generated. The previous idea stays available."
              : "This idea could not be generated. Try again.")}
        </p>
      )}
      {idea.status === "ready" && idea.errorMessage && (
        <p
          className="order-5 mt-3 text-xs leading-5 text-secondary lg:order-none"
          role="status"
        >
          {idea.errorMessage}
        </p>
      )}
      <div className="mt-auto hidden items-center justify-between gap-2 pt-5 lg:flex">
        {idea.status === "regenerating" && onCancelRegeneration ? (
          <Button type="button" variant="quiet" onClick={onCancelRegeneration}>
            Cancel
          </Button>
        ) : onSuggestAnother ? (
          <Button
            type="button"
            variant="quiet"
            onClick={onSuggestAnother}
            disabled={idea.status === "regenerating"}
          >
            Suggest another
          </Button>
        ) : (
          <span />
        )}
        {onViewDetails && (
          <Button type="button" variant="primary" onClick={onViewDetails}>
            View details
          </Button>
        )}
      </div>
      <div className="order-6 mt-3 flex items-center justify-between gap-3 lg:hidden">
        {idea.status === "regenerating" && onCancelRegeneration ? (
          <Button variant="quiet" onClick={onCancelRegeneration}>
            Cancel
          </Button>
        ) : onSuggestAnother ? (
          <Button
            variant="quiet"
            onClick={onSuggestAnother}
            disabled={idea.status === "regenerating"}
          >
            Suggest another
          </Button>
        ) : (
          <span />
        )}
        {ideaNumber != null && (
          <span className="text-xs text-secondary">{ideaNumber} of 3</span>
        )}
      </div>
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
  selectedDirection,
  onSelectDirection,
  onBack,
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
  const [localDirection, setLocalDirection] =
    useState<OutfitDirection>("closest");
  const selected = selectedDirection ?? localDirection;
  const setSelected = (direction: OutfitDirection) => {
    if (selectedDirection === undefined) setLocalDirection(direction);
    onSelectDirection?.(direction);
  };
  const panelId = useId();
  const active =
    orderedIdeas.find((idea) => idea.direction === selected) ?? orderedIdeas[0];
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
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
    <section className={styles.page} aria-labelledby="outfit-ideas-title">
      <div className={styles.header}>
        <div>
          <p className={styles.stepLabel}>Step 4 of 5</p>
          <h1 id="outfit-ideas-title" className={styles.heading}>
            Three ways to <em className="text-crimson">wear it.</em>
          </h1>
          <p className="mt-3 hidden max-w-[620px] text-base leading-6 text-secondary lg:block">
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
              disabled={active.status === "unavailable"}
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
        <div className="mb-5 hidden w-fit flex-wrap items-center gap-2 rounded-full border border-stone bg-paper px-3 py-2 text-xs lg:flex">
          <span className="flex items-center gap-1.5 text-secondary">
            <Icon name="sparkle" className="size-3.5 text-crimson" />
            Personalized with
          </span>
          {preferencesUsed.map((preference) => (
            <Chip
              key={preference}
              selected
              disabled
              className="disabled:opacity-100"
            >
              {preference}
            </Chip>
          ))}
        </div>
      )}
      {status === "loading" && (
        <div className="grid gap-3 lg:grid-cols-3" aria-busy="true">
          {order.map((direction, index) => (
            <div
              key={direction}
              className={`h-[580px] animate-pulse rounded-[20px] border border-stone bg-paper p-4 motion-reduce:animate-none ${index > 0 ? "hidden lg:block" : ""}`}
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
          {onRetry && (
            <Button
              type="button"
              variant="secondary"
              onClick={onRetry}
              className="mt-4"
            >
              {status === "error" ? "Retry ideas" : "Refresh ideas"}
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
                id={`${panelId}-${direction}`}
                aria-controls={panelId}
                tabIndex={selected === direction ? 0 : -1}
                onClick={() => setSelected(direction)}
                onKeyDown={(event) => {
                  const index = order.indexOf(direction);
                  const next =
                    event.key === "ArrowRight"
                      ? (index + 1) % 3
                      : event.key === "ArrowLeft"
                        ? (index + 2) % 3
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? 2
                            : null;
                  if (next == null) return;
                  event.preventDefault();
                  setSelected(order[next]);
                  event.currentTarget.parentElement
                    ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                    [next]?.focus();
                }}
                className={`min-h-11 shrink-0 rounded-full border px-3 text-sm ${active?.direction === direction ? "border-crimson bg-blush font-medium text-ink" : "border-stone bg-paper text-ink"}`}
              >
                {direction === "closest"
                  ? "Closest"
                  : direction === "from_wardrobe"
                    ? "From your wardrobe"
                    : "Fresh"}
              </button>
            ))}
          </div>
          <div
            className={`hidden gap-5 lg:grid lg:grid-cols-3 ${ideas.some((idea) => idea.status !== "ready") ? "items-start" : ""}`}
          >
            {orderedIdeas.map((idea) => (
              <div key={idea.id} className="flex min-w-0 flex-col gap-5">
                <OutfitIdeaCard
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
                {idea.direction === "fresh_alternative" && !hasPreferences && (
                  <PreferenceNotice onSetPreferences={onSetPreferences} />
                )}
              </div>
            ))}
          </div>
          {active && (
            <div
              className="lg:hidden"
              id={panelId}
              role="tabpanel"
              aria-labelledby={`${panelId}-${active.direction}`}
              tabIndex={0}
              onTouchStart={(event) => {
                touchStartX.current = event.touches[0]?.clientX ?? 0;
                touchStartY.current = event.touches[0]?.clientY ?? 0;
              }}
              onTouchEnd={(event) => {
                const deltaX =
                  (event.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
                const deltaY =
                  (event.changedTouches[0]?.clientY ?? 0) - touchStartY.current;
                if (Math.abs(deltaX) > Math.abs(deltaY)) changeBySwipe(deltaX);
              }}
            >
              <OutfitIdeaCard
                idea={active}
                ideaNumber={order.indexOf(active.direction) + 1}
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
                    aria-pressed={active.direction === direction}
                    className="flex size-11 items-center justify-center"
                  >
                    <span
                      className={`h-2 rounded-full ${active.direction === direction ? "w-6 bg-crimson" : "w-2 bg-stone"}`}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {status === "ready" && !hasPreferences && (
        <div className="mt-5 lg:hidden">
          <PreferenceNotice onSetPreferences={onSetPreferences} />
        </div>
      )}
      {status === "ready" && active && (onBack || onViewDetails) && (
        <div className={styles.mobileFooter}>
          {onBack ? (
            <Button variant="quiet" onClick={onBack}>
              <Icon name="arrow-left" className="size-4" /> Match
            </Button>
          ) : (
            <span />
          )}
          {onViewDetails && (
            <Button
              type="button"
              variant="primary"
              onClick={() => onViewDetails(active)}
              disabled={active.status === "unavailable"}
            >
              View details
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
