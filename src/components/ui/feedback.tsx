import type { ReactNode } from "react";
import { Icon, Skeleton } from "./primitives";

export function RecoveryPanel({
  kind,
  title,
  message,
  action,
  reference,
}: {
  kind: "not-found" | "error";
  title: string;
  message: string;
  action: ReactNode;
  reference?: string;
}) {
  return (
    <section className="mx-auto grid max-w-xl justify-items-center gap-4 rounded-panel bg-paper p-8 text-center text-ink">
      <Icon name={kind === "not-found" ? "search" : "refresh"} size={32} />
      <h2 className="font-display text-4xl">{title}</h2>
      <p className="text-secondary">{message}</p>
      {action}
      {reference && (
        <small className="text-secondary">Reference {reference}</small>
      )}
    </section>
  );
}

export function LoadingLayout({
  kind,
  label = "Loading",
}: {
  kind:
    | "upload"
    | "review"
    | "matches"
    | "ideas"
    | "shopping"
    | "wardrobe"
    | "preview";
  label?: string;
}) {
  const grid = kind === "wardrobe" || kind === "ideas" || kind === "shopping";
  return (
    <div
      role="status"
      aria-label={label}
      className="space-y-4 rounded-card bg-paper p-4"
    >
      <span className="sr-only">{label}</span>
      <div
        aria-hidden="true"
        className={
          grid
            ? "grid grid-cols-3 gap-3"
            : kind === "preview" || kind === "upload"
              ? "grid grid-cols-[3fr_2fr] gap-4"
              : "grid gap-3"
        }
      >
        {grid ? (
          Array.from({ length: kind === "wardrobe" ? 6 : 3 }, (_, i) => (
            <div className="space-y-2" key={i}>
              <Skeleton className="aspect-square" />
              <Skeleton className="w-2/3" />
            </div>
          ))
        ) : kind === "preview" || kind === "upload" ? (
          <>
            <Skeleton
              className={kind === "preview" ? "aspect-[2/3]" : "aspect-[4/3]"}
            />
            <div className="space-y-3">
              <Skeleton />
              <Skeleton className="w-2/3" />
              <Skeleton className="aspect-video" />
            </div>
          </>
        ) : (
          [0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-12" />
              <div className="grow space-y-2">
                <Skeleton className="w-2/3" />
                <Skeleton className="w-1/2" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
