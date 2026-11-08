"use client";

import { Badge, Button, Icon } from "@/components/ui";
import Image from "next/image";
import type { ColorSwatch, ConfidenceReview, DetectedPiece } from "./types";
import styles from "./create-presentation.module.css";

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
  onBack?: () => void;
  onAddPiece?: () => void;
  onEditPiece?: (piece: DetectedPiece) => void;
  onRemovePiece?: (piece: DetectedPiece) => void;
  onRetryDescription?: () => void;
  retryDescriptionLabel?: string;
  provisional?: boolean;
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
        <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-porcelain text-secondary sm:flex">
          <Icon
            name={piece.category === "accessory" ? "bag" : "shirt"}
            className="size-5"
          />
        </span>
        <span
          className="mt-0.5 size-7 shrink-0 rounded-full border border-stone bg-sand sm:hidden"
          style={
            piece.colors?.[0]?.hex
              ? { backgroundColor: piece.colors[0].hex }
              : undefined
          }
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-5 text-ink">
            {number != null && (
              <span className="hidden sm:inline">{number} </span>
            )}
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
              className="flex size-11 items-center justify-center rounded-lg text-secondary hover:bg-porcelain hover:text-crimson"
              aria-label={`Edit ${piece.name}`}
            >
              <Icon name="edit" className="size-4" />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="hidden size-11 items-center justify-center rounded-lg text-secondary hover:bg-porcelain hover:text-crimson sm:flex"
              aria-label={`Remove ${piece.name}`}
            >
              <Icon name="trash" className="size-4" />
            </button>
          )}
        </div>
      </div>
      {piece.attributes?.length ? (
        <dl className={`${styles.pieceAttributes} mt-3 flex flex-wrap gap-1.5`}>
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
        <p className="mt-3 hidden items-start gap-1.5 text-xs leading-5 text-secondary sm:flex">
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
      className={styles.confidencePanel}
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
          {review.stale ? (
            "Previous review"
          ) : review.status === "ready" ? (
            <>
              <span className="sm:hidden">Ready</span>
              <span className="hidden sm:inline">Separate analysis</span>
            </>
          ) : pending ? (
            "In progress"
          ) : (
            "Unavailable"
          )}
        </Badge>
      </div>
      {pending && review.stale && (
        <p className="mt-3 text-xs text-secondary" role="status">
          Updating the review. The previous results stay visible below.
        </p>
      )}
      {pending && !review.insights?.length && (
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
          {onRetry && (
            <Button
              type="button"
              variant="secondary"
              onClick={onRetry}
              className="mt-3"
            >
              {review.status === "failed" ? "Retry review" : "Refresh review"}
            </Button>
          )}
        </div>
      )}
      {(review.status === "ready" || Boolean(review.insights?.length)) && (
        <>
          {review.palette?.length ? (
            <>
              <h3 className="mt-5 hidden text-xs font-semibold text-secondary sm:block">
                Palette
              </h3>
              <div className="mt-3 hidden flex-wrap gap-2 sm:flex">
                {review.palette?.map((color) => (
                  <div key={color.name} className="text-center">
                    <div
                      className="h-9 w-14 rounded-lg border border-stone bg-sand"
                      style={
                        color.hex ? { backgroundColor: color.hex } : undefined
                      }
                    />
                    <span className="mt-1 block text-[11px] text-secondary">
                      {color.name}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
          <h3 className="mt-5 hidden text-xs font-semibold text-secondary sm:block">
            Style review
          </h3>
          <ul className="mt-3 space-y-3">
            {review.insights?.map((insight) => (
              <li
                key={insight.title}
                className="flex gap-2 text-xs leading-5 sm:text-sm"
              >
                <Icon
                  name="check"
                  className="mt-0.5 size-4 shrink-0 text-[var(--color-owned)]"
                />
                <span>
                  <strong className="font-medium text-ink sm:block">
                    {insight.title}
                  </strong>
                  <span className="sm:hidden">: </span>
                  <span className="text-secondary sm:block">
                    {insight.description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {review.reasons?.length ? (
            <details className="mt-4 text-sm text-secondary">
              <summary className="min-h-11 cursor-pointer py-3 font-medium text-crimson">
                Why this review
              </summary>
              <ul className="list-disc space-y-2 pl-4">
                {review.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {review.inputsUsed?.length ? (
                <p className="mt-3 text-xs">
                  Inputs used: {review.inputsUsed.join(", ")}
                </p>
              ) : null}
              {review.evidence?.map((evidence) => (
                <p key={evidence} className="mt-2 text-xs">
                  {evidence}
                </p>
              ))}
            </details>
          ) : null}
          {review.occasions?.length ? (
            <div className="mt-5 hidden flex-wrap gap-1.5 sm:flex">
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
  onBack,
  onAddPiece,
  onEditPiece,
  onRemovePiece,
  onRetryDescription,
  retryDescriptionLabel = "Retry descriptions",
  provisional = false,
  onRetryConfidence,
}: ReviewPiecesProps) {
  const remaining = Math.max(
    0,
    (expectedPieceCount ?? pieces.length) - pieces.length,
  );
  const descriptionPending =
    descriptionStatus === "queued" || descriptionStatus === "running";
  const palette =
    confidence.palette ??
    pieces
      .flatMap((piece) => piece.colors ?? [])
      .filter(
        (color, index, colors) =>
          colors.findIndex(
            (candidate) =>
              candidate.name === color.name && candidate.hex === color.hex,
          ) === index,
      );
  return (
    <section className={styles.page} aria-labelledby="review-pieces-title">
      <div className={styles.pageHeader}>
        <div>
          <p className={styles.stepLabel}>Step 2 of 5</p>
          <h1 id="review-pieces-title" className={styles.heading}>
            Review the <em className="text-crimson">pieces.</em>
          </h1>
          <p className={styles.desktopDescription}>
            Correct anything that looks wrong. Edits refresh matches and ideas,
            never your upload.
          </p>
          <p className="mt-2 text-sm text-secondary sm:hidden">
            Edits refresh matches, never your upload.
          </p>
        </div>
        {onMatch && (
          <div className={styles.desktopAction}>
            <Button
              type="button"
              variant="primary"
              onClick={onMatch}
              disabled={
                pieces.length === 0 || descriptionPending || provisional
              }
            >
              Match wardrobe
            </Button>
            <p className="mt-2 text-xs text-secondary">
              {matchStatus === "ready"
                ? "Matching is ready for this version"
                : matchStatus === "running"
                  ? "Matching is in progress"
                  : provisional
                    ? "Apply a provisional piece or complete analysis before matching"
                    : pieces.length === 0
                      ? "Complete analysis or add a piece before matching"
                      : "Matches use reviewed pieces"}
            </p>
          </div>
        )}
      </div>
      <div className={styles.reviewGrid}>
        <div className="space-y-4">
          <figure className="flex gap-3 rounded-[20px] border border-stone bg-paper p-3 sm:block">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-sand sm:aspect-[4/5] sm:size-auto">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={imageAlt}
                  width={600}
                  height={800}
                  unoptimized
                  className="h-full max-h-[460px] w-full object-contain"
                />
              ) : (
                <Icon
                  name="image"
                  label="Reference image unavailable"
                  className="size-8 text-secondary"
                />
              )}
            </div>
            <figcaption className="flex items-center gap-2 text-xs leading-5 text-secondary sm:mt-2">
              <Icon
                name="image"
                className="hidden size-4 shrink-0 sm:inline-block"
              />
              <span>
                <strong className="mb-0.5 block font-medium text-ink sm:hidden">
                  Your reference
                </strong>
                <span className="hidden sm:inline">Original reference. </span>
                Pieces are text descriptions, not cutouts.
                {palette.length > 0 && (
                  <span className="mt-1 flex gap-0.5 sm:hidden">
                    {palette.slice(0, 6).map((color) => (
                      <Swatch
                        key={`${color.name}-${color.hex}`}
                        color={color}
                      />
                    ))}
                  </span>
                )}
              </span>
            </figcaption>
          </figure>
          <ConfidencePanel
            review={{ ...confidence, palette }}
            onRetry={onRetryConfidence}
          />
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
          {provisional && (
            <p role="status" className="mb-3 text-sm text-secondary">
              Provisional pieces are not saved yet. Review and apply a piece in
              the editor before matching.
            </p>
          )}
          {!pieces.length && !descriptionPending && (
            <p className="mb-3 text-sm text-secondary">
              Complete analysis or add a piece before matching your wardrobe.
            </p>
          )}
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
                        {expectedPieceCount != null
                          ? `Reading ${pieces.length + index + 1} of ${expectedPieceCount}`
                          : "Reading pieces"}
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
                    {retryDescriptionLabel}
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
      {(onMatch || onBack) && (
        <div className={styles.mobileFooter}>
          {onBack ? (
            <Button variant="quiet" onClick={onBack}>
              <Icon name="arrow-left" className="size-4" /> Back to Upload
            </Button>
          ) : (
            <span />
          )}
          {onMatch && (
            <Button
              type="button"
              variant="primary"
              onClick={onMatch}
              disabled={
                pieces.length === 0 || descriptionPending || provisional
              }
            >
              Match wardrobe
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
