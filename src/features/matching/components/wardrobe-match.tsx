"use client";

import { Badge, Button, Icon } from "@/components/ui";

export type WardrobeMatch = {
  id: string;
  outcome: "owned_match" | "wardrobe_alternative" | "missing";
  inspiration: { name: string; category?: string; summary?: string };
  wardrobeItem?: { id: string; name: string; imageUrl?: string | null } | null;
  sharedAttributes?: string[];
  differences?: string[];
  explanation?: string | null;
  missingBrief?: string | null;
  rejectedCandidates?: {
    name: string;
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
      className="grid grid-cols-3 gap-2.5"
      aria-label="Wardrobe match summary"
    >
      <div className="rounded-2xl bg-[var(--color-owned-bg)] px-3 py-3 text-[var(--color-owned)] sm:flex sm:items-center sm:justify-between sm:px-5">
        <span className="hidden items-center gap-2 text-sm font-semibold sm:flex">
          <Icon name="check" className="size-5" />
          In your wardrobe
        </span>
        <strong className="block font-serif text-3xl font-normal leading-none sm:order-2">
          {counts.owned_match}
        </strong>
        <span className="mt-1 block text-xs sm:hidden">Owned</span>
      </div>
      <div className="rounded-2xl bg-[var(--color-alternative-bg)] px-3 py-3 text-[var(--color-alternative)] sm:flex sm:items-center sm:justify-between sm:px-5">
        <span className="hidden items-center gap-2 text-sm font-semibold sm:flex">
          <Icon name="swap" className="size-5" />
          Alternative in your wardrobe
        </span>
        <strong className="block font-serif text-3xl font-normal leading-none sm:order-2">
          {counts.wardrobe_alternative}
        </strong>
        <span className="mt-1 block text-xs sm:hidden">Alternative</span>
      </div>
      <div className="rounded-2xl bg-[var(--color-missing-bg)] px-3 py-3 text-[var(--color-missing)] sm:flex sm:items-center sm:justify-between sm:px-5">
        <span className="hidden items-center gap-2 text-sm font-semibold sm:flex">
          <Icon name="bag" className="size-5" />
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
    <article
      className={`rounded-[18px] border bg-paper p-3 sm:p-4 ${owned ? "border-stone" : "border-rose-wash"}`}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="hidden min-w-0 flex-1 sm:block">
          <p className="text-xs text-secondary">From the inspiration</p>
          <h3 className="mt-1 font-semibold text-ink">
            {match.inspiration.name}
          </h3>
          <p className="mt-1 text-xs text-secondary">
            {match.inspiration.summary ?? match.inspiration.category}
          </p>
        </div>
        <span className="hidden size-8 shrink-0 items-center justify-center rounded-full bg-porcelain text-secondary sm:flex">
          <Icon name="arrow-right" className="size-4" />
        </span>
        <div
          className={`flex size-[84px] shrink-0 items-center justify-center overflow-hidden rounded-xl sm:size-[94px] ${owned ? "bg-sand" : "bg-[var(--color-missing-bg)]"}`}
        >
          {owned && match.wardrobeItem?.imageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={match.wardrobeItem.imageUrl}
                alt={match.wardrobeItem.name}
                className="size-full object-contain"
              />
            </>
          ) : (
            <div
              className={`text-center text-xs ${owned ? "text-secondary" : "text-[var(--color-missing)]"}`}
            >
              <Icon
                name={owned ? "image" : "bag"}
                className="mx-auto mb-1 size-6"
              />
              {owned ? "Image unavailable" : "Text brief"}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-secondary sm:hidden">
            For: {match.inspiration.name}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-semibold leading-5 text-ink">
              {owned
                ? (match.wardrobeItem?.name ?? "Wardrobe item unavailable")
                : "Nothing credible in your wardrobe"}
            </h3>
            <Badge tone={outcomeTone[match.outcome]}>
              {outcomeLabel[match.outcome]}
            </Badge>
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
            <p className="mt-1 line-clamp-1 text-xs text-secondary sm:hidden">
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
            <p className="mt-1 text-xs leading-5 text-secondary">
              {match.explanation}
            </p>
          )}
          {match.missingBrief && (
            <p className="mt-2 text-xs leading-5 text-secondary">
              Brief: {match.missingBrief}
            </p>
          )}
        </div>
      </div>
      {match.rejectedCandidates?.length ? (
        <div className="mt-3 space-y-1.5">
          {match.rejectedCandidates.map((candidate) => (
            <div
              key={candidate.name}
              className="flex items-center gap-2 rounded-xl bg-porcelain px-2 py-1.5 text-xs leading-5 text-secondary"
            >
              <Icon
                name="x"
                className="size-4 shrink-0 text-[var(--color-missing)]"
              />
              <span>
                {candidate.name} rejected: {candidate.reason}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {match.outcome === "missing" && match.shoppingStatus === "running" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-secondary">
          <Icon name="refresh" className="size-3.5 text-crimson" />
          Shopping results for this piece are loading in the background
        </p>
      )}
    </article>
  );
}

export function WardrobeMatchView({
  matches,
  status = "ready",
  errorMessage,
  ideasStatus,
  onGenerateIdeas,
  onRetry,
}: WardrobeMatchViewProps) {
  return (
    <section
      className="mx-auto w-full max-w-[1150px] pb-8"
      aria-labelledby="wardrobe-match-title"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm font-semibold text-crimson">Step 3 of 5</p>
          <h1
            id="wardrobe-match-title"
            className="mt-2 font-serif text-[clamp(2.2rem,4vw,3.2rem)] leading-tight"
          >
            A clear view of <em className="text-crimson">what you have.</em>
          </h1>
          <p className="mt-2 max-w-[620px] text-base leading-6 text-secondary">
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
              disabled={status !== "ready"}
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
          {onRetry && status === "error" && (
            <Button
              type="button"
              variant="secondary"
              onClick={onRetry}
              className="mt-4"
            >
              Retry matching
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
      {onGenerateIdeas && (
        <div className="sticky bottom-0 -mx-4 mt-5 flex items-center justify-between gap-3 border-t border-stone bg-paper px-4 py-3 sm:hidden">
          <span className="text-sm text-crimson">Wardrobe match</span>
          <Button
            type="button"
            variant="primary"
            onClick={onGenerateIdeas}
            disabled={status !== "ready"}
          >
            Generate ideas
          </Button>
        </div>
      )}
    </section>
  );
}
