"use client";

import Image from "next/image";
import { Badge, Button, Icon } from "@/components/ui";
import styles from "./matching.module.css";

export type WardrobeMatch = {
  id: string;
  outcome: "owned_match" | "wardrobe_alternative" | "missing";
  inspiration: { name: string; category?: string; summary?: string };
  wardrobeItem?: {
    id: string;
    name: string;
    imageUrl?: string | null;
    sourceType?: string;
    inventoryStatus?: string;
    archivedAt?: string | null;
  } | null;
  sharedAttributes?: string[];
  differences?: string[];
  explanation?: string | null;
  missingBrief?: string | null;
  reasons?: string[];
  evidence?: string[];
  inputsUsed?: string[];
  uncertainty?: string[];
  rejectedCandidates?: {
    name?: string;
    reason: string;
    imageUrl?: string | null;
  }[];
  shoppingStatus?: "queued" | "running" | "ready" | "failed" | "unavailable";
};

export type WardrobeMatchViewProps = {
  matches: WardrobeMatch[];
  status?: "loading" | "ready" | "error" | "unavailable";
  errorMessage?: string;
  ideasStatus?: "queued" | "running" | "ready" | "failed";
  onGenerateIdeas?: () => void;
  onBack?: () => void;
  onRetry?: () => void;
};

const outcomeTone = {
  owned_match: "owned",
  wardrobe_alternative: "alternative",
  missing: "missing",
} as const;
const outcomeLabel = {
  owned_match: "In your wardrobe",
  wardrobe_alternative: "Alternative",
  missing: "Missing",
} as const;

export function MatchSummary({ matches }: { matches: WardrobeMatch[] }) {
  const counts = {
    owned_match: matches.filter((match) => match.outcome === "owned_match")
      .length,
    wardrobe_alternative: matches.filter(
      (match) => match.outcome === "wardrobe_alternative",
    ).length,
    missing: matches.filter((match) => match.outcome === "missing").length,
  };
  return (
    <div
      className="grid grid-cols-3 gap-2.5 sm:gap-4"
      aria-label="Wardrobe match summary"
    >
      <div className="rounded-2xl bg-[var(--color-owned-bg)] px-3 py-3 text-[var(--color-owned)] sm:flex sm:items-center sm:justify-between sm:px-5">
        <span className="hidden items-center gap-2 text-sm font-semibold sm:flex">
          <span className={styles.summaryIcon}>
            <Icon name="check" className="size-5" />
          </span>
          In your wardrobe
        </span>
        <strong className="block font-serif text-3xl font-normal leading-none sm:order-2">
          {counts.owned_match}
        </strong>
        <span className="mt-1 block text-xs sm:hidden">Owned</span>
      </div>
      <div className="rounded-2xl bg-[var(--color-alternative-bg)] px-3 py-3 text-[var(--color-alternative)] sm:flex sm:items-center sm:justify-between sm:px-5">
        <span className="hidden items-center gap-2 text-sm font-semibold sm:flex">
          <span className={styles.summaryIcon}>
            <Icon name="swap" className="size-5" />
          </span>
          Alternative item
        </span>
        <strong className="block font-serif text-3xl font-normal leading-none sm:order-2">
          {counts.wardrobe_alternative}
        </strong>
        <span className="mt-1 block text-xs sm:hidden">Alternative</span>
      </div>
      <div className="rounded-2xl bg-[var(--color-missing-bg)] px-3 py-3 text-[var(--color-missing)] sm:flex sm:items-center sm:justify-between sm:px-5">
        <span className="hidden items-center gap-2 text-sm font-semibold sm:flex">
          <span className={styles.summaryIcon}>
            <Icon name="bag" className="size-5" />
          </span>
          Missing
        </span>
        <strong className="block font-serif text-3xl font-normal leading-none sm:order-2">
          {counts.missing}
        </strong>
        <span className="mt-1 block text-xs sm:hidden">Missing</span>
      </div>
    </div>
  );
}

export function WardrobeMatchCard({ match }: { match: WardrobeMatch }) {
  const owned = match.outcome !== "missing";
  return (
    <article className={`${styles.card} ${!owned ? styles.missing : ""}`}>
      <div className={styles.matchRow}>
        <div className={styles.inspiration}>
          <p className="text-xs text-secondary">From the inspiration</p>
          <h3 className="mt-1 font-semibold text-ink">
            {match.inspiration.name}
          </h3>
          <p className="mt-1 text-xs text-secondary">
            {match.inspiration.summary ?? match.inspiration.category}
          </p>
        </div>
        <span className={styles.matchArrow}>
          <Icon name="arrow-right" className="size-4" />
        </span>
        <div
          className={`${styles.thumbnail} ${owned ? "bg-sand" : "bg-[var(--color-missing-bg)]"}`}
        >
          {owned && match.wardrobeItem?.imageUrl ? (
            <Image
              src={match.wardrobeItem.imageUrl}
              alt={match.wardrobeItem.name}
              width={132}
              height={132}
              unoptimized
              className="size-full object-contain"
            />
          ) : (
            <div
              className={`text-center text-xs ${owned ? "text-secondary" : "text-[var(--color-missing)]"}`}
            >
              <Icon
                name={owned ? "image" : "bag"}
                className="mx-auto mb-1 size-6"
              />
              {owned ? (
                "Image unavailable"
              ) : (
                <span className="hidden sm:inline">Text brief</span>
              )}
            </div>
          )}
        </div>
        <div className={styles.matchContent}>
          {owned && (
            <p className="text-xs text-secondary sm:hidden">
              For: {match.inspiration.name}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-semibold leading-5 text-ink">
              {owned ? (
                (match.wardrobeItem?.name ?? "Wardrobe item unavailable")
              ) : (
                <>
                  <span className="sm:hidden">{match.inspiration.name}</span>
                  <span className="hidden sm:inline">
                    Nothing credible in your wardrobe
                  </span>
                </>
              )}
            </h3>
            <Badge tone={outcomeTone[match.outcome]}>
              {outcomeLabel[match.outcome]}
            </Badge>
            {match.wardrobeItem?.sourceType === "sample" && (
              <Badge>Example item</Badge>
            )}
            {match.wardrobeItem?.archivedAt && <Badge>Archived</Badge>}
            {match.wardrobeItem?.inventoryStatus === "saved_candidate" && (
              <Badge>Saved candidate · not owned</Badge>
            )}
          </div>
          {match.sharedAttributes?.length ? (
            <div className="mt-2 hidden flex-wrap gap-1 sm:flex">
              {match.sharedAttributes.map((attribute) => (
                <span
                  key={attribute}
                  className="inline-flex items-center gap-1 rounded-full bg-porcelain px-2 py-1 text-xs text-ink"
                >
                  <Icon
                    name="check"
                    className="size-3 text-[var(--color-owned)]"
                  />
                  {attribute}
                </span>
              ))}
            </div>
          ) : null}
          {match.sharedAttributes?.length ? (
            <p className="mt-1 text-xs leading-5 text-secondary sm:hidden">
              Shared: {match.sharedAttributes.join(", ")}
            </p>
          ) : null}
          {match.differences?.length ? (
            <p
              className={`mt-2 text-xs leading-5 ${match.outcome === "wardrobe_alternative" ? "text-[var(--color-alternative)]" : "text-secondary"}`}
            >
              Changes: {match.differences.join("; ")}
            </p>
          ) : null}
          {match.explanation && (
            <p className="mt-1 hidden text-xs leading-5 text-secondary sm:block">
              {match.explanation}
            </p>
          )}
          {match.missingBrief && (
            <p className="mt-2 hidden text-xs leading-5 text-secondary sm:block">
              Brief: {match.missingBrief}
            </p>
          )}
        </div>
        {match.rejectedCandidates?.length ? (
          <details className={styles.candidateRows}>
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-medium text-crimson">
              {match.rejectedCandidates.length} excluded{" "}
              {match.rejectedCandidates.length === 1
                ? "candidate"
                : "candidates"}
              <Icon name="chevron-down" className="size-3.5" />
            </summary>
            <ul
              className={styles.candidateList}
              aria-label="Excluded wardrobe candidates"
              tabIndex={0}
            >
              {match.rejectedCandidates.map((candidate, index) => (
                <li
                  key={`${candidate.name ?? "excluded"}-${index}`}
                  className="flex items-center gap-2 rounded-xl bg-porcelain px-2 py-1.5 text-xs leading-5 text-secondary"
                >
                  {candidate.imageUrl ? (
                    <Image
                      src={candidate.imageUrl}
                      alt={candidate.name ?? "Excluded wardrobe candidate"}
                      width={36}
                      height={36}
                      unoptimized
                      className="size-9 shrink-0 rounded-lg object-contain"
                    />
                  ) : (
                    <Icon
                      name="x"
                      className="size-4 shrink-0 text-[var(--color-missing)]"
                    />
                  )}
                  <span>
                    {candidate.name
                      ? `${candidate.name} rejected: `
                      : "Excluded: "}
                    {candidate.reason}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {Boolean(
          match.reasons?.length ||
          match.evidence?.length ||
          match.inputsUsed?.length ||
          match.uncertainty?.length,
        ) && (
          <details className={styles.whyThis}>
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-medium text-crimson">
              Why this match <Icon name="chevron-down" className="size-3.5" />
            </summary>
            {match.reasons?.length ? (
              <ul className="space-y-2">
                {match.reasons.map((reason, index) => (
                  <li
                    key={`${index}-${reason}`}
                    className="flex gap-2 text-xs leading-5"
                  >
                    <Icon
                      name="check"
                      className="mt-0.5 size-3.5 shrink-0 text-[var(--color-owned)]"
                    />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {match.evidence?.length ? (
              <p className="mt-3 text-xs leading-5 text-secondary">
                Evidence: {match.evidence.join("; ")}
              </p>
            ) : null}
            {match.inputsUsed?.length ? (
              <p className="mt-2 text-xs leading-5 text-secondary">
                Uses: {match.inputsUsed.join(", ")}
              </p>
            ) : null}
            {match.uncertainty?.length ? (
              <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-secondary">
                <Icon name="info" className="mt-0.5 size-3.5 shrink-0" />
                <span>{match.uncertainty.join("; ")}</span>
              </p>
            ) : null}
          </details>
        )}
        {match.outcome === "missing" && match.shoppingStatus === "running" && (
          <p
            className={`${styles.shoppingStatus} flex items-center gap-1.5 text-xs text-secondary`}
          >
            <Icon name="refresh" className="size-3.5 text-crimson" />
            Shopping results for this piece are loading in the background
          </p>
        )}
      </div>
    </article>
  );
}

export function WardrobeMatchView({
  matches,
  status = "ready",
  errorMessage,
  ideasStatus,
  onGenerateIdeas,
  onBack,
  onRetry,
}: WardrobeMatchViewProps) {
  return (
    <section className={styles.page} aria-labelledby="wardrobe-match-title">
      <div className={styles.header}>
        <div>
          <p className={styles.stepLabel}>Step 3 of 5</p>
          <h1 id="wardrobe-match-title" className={styles.heading}>
            A clear view of <em className="text-crimson">what you have.</em>
          </h1>
          <p className="mt-3 hidden max-w-[620px] text-base leading-6 text-secondary sm:block">
            We compare each piece with the clothes you own. Saved shopping
            candidates never count as owned.
          </p>
        </div>
        {onGenerateIdeas && (
          <div className="hidden text-right sm:block">
            <Button
              type="button"
              variant="primary"
              onClick={onGenerateIdeas}
              disabled={status !== "ready" || matches.length === 0}
            >
              Generate outfit ideas
            </Button>
            <p className="mt-2 text-xs text-secondary">
              {ideasStatus === "running"
                ? "Three ideas are already being prepared"
                : "See three ways to wear it"}
            </p>
          </div>
        )}
      </div>
      {status === "loading" && (
        <div aria-busy="true" className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-2xl bg-sand motion-reduce:animate-none"
              />
            ))}
          </div>
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-2xl border border-stone bg-paper motion-reduce:animate-none"
            />
          ))}
        </div>
      )}
      {(status === "error" || status === "unavailable") && (
        <div
          className="rounded-2xl border border-stone bg-paper p-6"
          role="alert"
        >
          <Icon name="info" className="size-6 text-crimson" />
          <h2 className="mt-3 font-serif text-2xl">
            Wardrobe matching is unavailable
          </h2>
          <p className="mt-2 text-sm text-secondary">
            {errorMessage ??
              "Your reviewed pieces are still saved. Try again when matching is available."}
          </p>
          {onRetry && (
            <Button
              type="button"
              variant="secondary"
              onClick={onRetry}
              className="mt-4"
            >
              {status === "error" ? "Retry matching" : "Refresh matching"}
            </Button>
          )}
        </div>
      )}
      {status === "ready" && (
        <>
          <MatchSummary matches={matches} />
          <div className="mt-4 space-y-3">
            {matches.map((match) => (
              <WardrobeMatchCard key={match.id} match={match} />
            ))}
            {matches.length === 0 && (
              <div className="rounded-2xl border border-stone bg-paper p-6 text-center">
                <Icon name="shirt" className="mx-auto size-8 text-secondary" />
                <p className="mt-2 font-semibold">
                  No pieces have been matched yet
                </p>
                <p className="mt-1 text-sm text-secondary">
                  Review the inspiration pieces before matching your wardrobe.
                </p>
              </div>
            )}
          </div>
        </>
      )}
      {(onGenerateIdeas || onBack) && (
        <div className={styles.mobileFooter}>
          {onBack ? (
            <Button variant="quiet" onClick={onBack}>
              <Icon name="arrow-left" className="size-4" /> Review
            </Button>
          ) : (
            <span />
          )}
          {onGenerateIdeas && (
            <Button
              type="button"
              variant="primary"
              onClick={onGenerateIdeas}
              disabled={status !== "ready" || matches.length === 0}
            >
              Generate ideas
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
