"use client";

import { Badge, Button, Icon } from "@/components/ui";
import type { ColorSwatch, ConfidenceReview, DetectedPiece } from "./types";

export type ReviewPiecesProps = {
  imageUrl: string;
  imageAlt?: string;
  pieces: DetectedPiece[];
  expectedPieceCount?: number;
  descriptionStatus?: "queued" | "running" | "ready" | "failed" | "unavailable";
  descriptionError?: string;
  confidence: ConfidenceReview;
  matchStatus?: "queued" | "running" | "ready" | "failed";
  onMatch?: () => void;
  onAddPiece?: () => void;
  onEditPiece?: (piece: DetectedPiece) => void;
  onRemovePiece?: (piece: DetectedPiece) => void;
  onRetryDescription?: () => void;
  onRetryConfidence?: () => void;
};

function Swatch({ color }: { color: ColorSwatch }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={color.name}>
      <span
        className="size-5 shrink-0 rounded-full border border-stone bg-sand"
        style={color.hex ? { backgroundColor: color.hex } : undefined}
      />
      <span className="sr-only">{color.name}</span>
    </span>
  );
}

export function DetectedPieceCard({
  piece,
  number,
  onEdit,
  onRemove,
}: {
  piece: DetectedPiece;
  number?: number;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  return (
    <article className="rounded-2xl border border-stone bg-paper p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-porcelain text-secondary">
          <Icon
            name={piece.category === "accessory" ? "bag" : "shirt"}
            className="size-5"
          />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-5 text-ink">
            {number != null ? `${number} ` : ""}
            {piece.name}
          </h3>
          <p className="mt-0.5 text-xs text-secondary">
            {piece.category[0].toUpperCase() + piece.category.slice(1)}
            {piece.subcategory ? `, ${piece.subcategory}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {piece.colors?.length ? (
            <span className="hidden gap-0.5 sm:flex">
              {piece.colors.slice(0, 3).map((color) => (
                <Swatch key={color.name} color={color} />
              ))}
            </span>
          ) : null}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex size-8 items-center justify-center rounded-lg text-secondary hover:bg-porcelain hover:text-crimson"
              aria-label={`Edit ${piece.name}`}
            >
              <Icon name="edit" className="size-4" />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="flex size-8 items-center justify-center rounded-lg text-secondary hover:bg-porcelain hover:text-crimson"
              aria-label={`Remove ${piece.name}`}
            >
              <Icon name="trash" className="size-4" />
            </button>
          )}
        </div>
      </div>
      {piece.attributes?.length ? (
        <dl className="mt-3 flex flex-wrap gap-1.5">
          {piece.attributes.map(({ label, value }) => (
            <div
              key={`${label}-${value}`}
              className="min-w-0 rounded-lg bg-porcelain px-2.5 py-1.5"
            >
              <dt className="text-[11px] leading-3 text-secondary">{label}</dt>
              <dd className="mt-0.5 text-xs font-medium leading-4 text-ink">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {piece.evidence && (
        <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-secondary">
          <Icon name="search" className="mt-0.5 size-3.5 shrink-0" />
          <span>Seen: {piece.evidence}</span>
        </p>
      )}
      {piece.advice && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-blush px-3 py-2 text-xs leading-5 text-ink">
          <Icon
            name="sparkle"
            className="mt-0.5 size-3.5 shrink-0 text-crimson"
          />
          <span>For you: {piece.advice}</span>
        </p>
      )}
      {piece.uncertainty && (
        <p className="mt-2 text-xs leading-5 text-secondary">
          {piece.uncertainty}
        </p>
      )}
    </article>
  );
}

export function ConfidencePanel({
  review,
  onRetry,
}: {
  review: ConfidenceReview;
  onRetry?: () => void;
}) {
  const pending = review.status === "queued" || review.status === "running";
  return (
    <section
      className="rounded-[20px] border border-stone bg-paper p-4 sm:p-6"
      aria-labelledby="confidence-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="confidence-heading"
          className="flex items-center gap-2 font-semibold leading-5"
        >
          <Icon name="sparkle" className="size-4 text-crimson" />
          Review with confidence
        </h2>
        <Badge tone="neutral">
          {review.status === "ready"
            ? "Separate analysis"
            : pending
              ? "In progress"
              : "Unavailable"}
        </Badge>
      </div>
      {pending && (
        <div className="mt-5 space-y-3" aria-busy="true">
          <div className="h-4 w-2/3 animate-pulse rounded bg-sand motion-reduce:animate-none" />
          <div className="h-4 w-full animate-pulse rounded bg-sand motion-reduce:animate-none" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-sand motion-reduce:animate-none" />
        </div>
      )}
      {(review.status === "failed" || review.status === "unavailable") && (
        <div className="mt-5 rounded-xl bg-porcelain p-4 text-sm">
          <p>
            {review.errorMessage ??
              "This separate review is unavailable right now. Your piece descriptions remain available."}
          </p>
          {onRetry && review.status === "failed" && (
            <Button
              type="button"
              variant="secondary"
              onClick={onRetry}
              className="mt-3"
            >
              Retry review
            </Button>
          )}
        </div>
      )}
      {review.status === "ready" && (
        <>
          <h3 className="mt-5 text-xs font-semibold text-secondary">Palette</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {review.palette?.map((color) => (
              <div key={color.name} className="text-center">
                <div
                  className="h-9 w-14 rounded-lg border border-stone bg-sand"
                  style={color.hex ? { backgroundColor: color.hex } : undefined}
                />
                <span className="mt-1 block text-[11px] text-secondary">
                  {color.name}
                </span>
              </div>
            ))}
          </div>
          <h3 className="mt-5 text-xs font-semibold text-secondary">
            With your selections
          </h3>
          <ul className="mt-3 space-y-3">
            {review.insights?.map((insight) => (
              <li key={insight.title} className="flex gap-2 text-sm">
                <Icon
                  name="check"
                  className="mt-0.5 size-4 shrink-0 text-[var(--color-owned)]"
                />
                <span>
                  <strong className="block font-medium text-ink">
                    {insight.title}
                  </strong>
                  <span className="block text-secondary">
                    {insight.description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {review.occasions?.length ? (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {review.occasions.map((occasion) => (
                <span
                  key={occasion}
                  className="rounded-full border border-crimson bg-blush px-3 py-1.5 text-xs text-ink"
                >
                  {occasion}
                </span>
              ))}
            </div>
          ) : null}
          {review.uncertainty && (
            <p className="mt-5 flex items-start gap-2 rounded-xl bg-porcelain px-3 py-2 text-xs leading-5 text-secondary">
              <Icon name="info" className="mt-0.5 size-4 shrink-0" />
              {review.uncertainty}
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function ReviewPieces({
  imageUrl,
  imageAlt = "Original outfit inspiration",
  pieces,
  expectedPieceCount,
  descriptionStatus = "ready",
  descriptionError,
  confidence,
  matchStatus,
  onMatch,
  onAddPiece,
  onEditPiece,
  onRemovePiece,
  onRetryDescription,
  onRetryConfidence,
}: ReviewPiecesProps) {
  const remaining = Math.max(
    0,
    (expectedPieceCount ?? pieces.length) - pieces.length,
  );
  const descriptionPending =
    descriptionStatus === "queued" || descriptionStatus === "running";
  return (
    <section
      className="mx-auto w-full max-w-[1150px] pb-8"
      aria-labelledby="review-pieces-title"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm font-semibold text-crimson">Step 2 of 5</p>
          <h1
            id="review-pieces-title"
            className="mt-2 font-serif text-[clamp(2.2rem,4vw,3.2rem)] leading-tight"
          >
            Review the <em className="text-crimson">pieces.</em>
          </h1>
          <p className="mt-2 max-w-[620px] text-base leading-6 text-secondary">
            Correct anything that looks wrong. Edits refresh matches and ideas,
            never your upload.
          </p>
        </div>
        {onMatch && (
          <div className="hidden text-right sm:block">
            <Button
              type="button"
              variant="primary"
              onClick={onMatch}
              disabled={pieces.length === 0 || descriptionPending}
            >
              Match wardrobe
            </Button>
            <p className="mt-2 text-xs text-secondary">
              {matchStatus === "ready"
                ? "Matching is ready for this version"
                : matchStatus === "running"
                  ? "Matching is in progress"
                  : "Matches use reviewed pieces"}
            </p>
          </div>
        )}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-5">
        <div className="space-y-4">
          <figure className="flex gap-3 rounded-[20px] border border-stone bg-paper p-3 sm:block">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-sand sm:aspect-[4/5] sm:size-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={imageAlt}
                className="h-full max-h-[460px] w-full object-contain"
              />
            </div>
            <figcaption className="flex items-center gap-2 text-xs leading-5 text-secondary sm:mt-2">
              <Icon name="image" className="size-4 shrink-0" />
              <span>
                <strong className="mb-0.5 block font-medium text-ink sm:hidden">
                  Your reference
                </strong>
                Original reference. Pieces are text descriptions, not cutouts.
              </span>
            </figcaption>
          </figure>
          <ConfidencePanel review={confidence} onRetry={onRetryConfidence} />
        </div>
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <h2 className="font-serif text-2xl sm:text-[28px]">
                Detected pieces
              </h2>
              {expectedPieceCount != null && (
                <span className="text-xs text-secondary">
                  {pieces.length} of {expectedPieceCount} ready
                </span>
              )}
            </div>
            {onAddPiece && (
              <Button type="button" variant="secondary" onClick={onAddPiece}>
                Add piece
              </Button>
            )}
          </div>
          <div className="space-y-3">
            {pieces.map((piece, index) => (
              <DetectedPieceCard
                key={piece.id}
                piece={piece}
                number={index + 1}
                onEdit={onEditPiece ? () => onEditPiece(piece) : undefined}
                onRemove={
                  onRemovePiece ? () => onRemovePiece(piece) : undefined
                }
              />
            ))}
            {descriptionPending &&
              (expectedPieceCount == null || remaining > 0) &&
              Array.from(
                { length: Math.min(Math.max(remaining, 1), 2) },
                (_, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-stone bg-paper p-4"
                    aria-busy="true"
                  >
                    <div className="flex items-center gap-3">
                      <span className="size-8 rounded-xl bg-sand" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-2/3 animate-pulse rounded bg-sand motion-reduce:animate-none" />
                        <div className="h-3 w-1/3 animate-pulse rounded bg-sand motion-reduce:animate-none" />
                      </div>
                      <span className="text-xs text-crimson">
                        Reading {pieces.length + index + 1} of{" "}
                        {expectedPieceCount ?? "more"}
                      </span>
                    </div>
                  </div>
                ),
              )}
            {(descriptionStatus === "failed" ||
              descriptionStatus === "unavailable") && (
              <div
                className="rounded-2xl border border-stone bg-paper p-5"
                role="alert"
              >
                <p className="font-semibold">
                  Piece descriptions are unavailable
                </p>
                <p className="mt-1 text-sm text-secondary">
                  {descriptionError ??
                    "Your original image and any complete pieces remain available."}
                </p>
                {onRetryDescription && descriptionStatus === "failed" && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onRetryDescription}
                    className="mt-3"
                  >
                    Retry descriptions
                  </Button>
                )}
              </div>
            )}
            {pieces.length === 0 &&
              !descriptionPending &&
              descriptionStatus === "ready" && (
                <div className="rounded-2xl border border-stone bg-paper p-6 text-center">
                  <Icon
                    name="shirt"
                    className="mx-auto size-8 text-secondary"
                  />
                  <p className="mt-2 font-semibold">No pieces to review yet</p>
                  <p className="mt-1 text-sm text-secondary">
                    Add a piece if one is visible in the reference.
                  </p>
                </div>
              )}
          </div>
        </div>
      </div>
      {onMatch && (
        <div className="sticky bottom-0 -mx-4 mt-5 flex items-center justify-between gap-3 border-t border-stone bg-paper px-4 py-3 sm:hidden">
          <span className="text-sm text-crimson">Review pieces</span>
          <Button
            type="button"
            variant="primary"
            onClick={onMatch}
            disabled={pieces.length === 0 || descriptionPending}
          >
            Match wardrobe
          </Button>
        </div>
      )}
    </section>
  );
}
