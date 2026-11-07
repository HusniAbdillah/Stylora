"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Badge, Button, Chip, ConfirmDialog, Icon } from "@/components/ui";

export type SavedLookItem = {
  id: string;
  name: string;
  category: string;
  imageUrl?: string | null;
  status: "owned" | "alternative" | "candidate" | "missing";
};

export type SavedLook = {
  id: string;
  title: string;
  subtitle?: string;
  savedAt: string;
  avatarUrl?: string | null;
  mediaStatus:
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "unavailable"
    | "cancelled"
    | "superseded";
  canRetry?: boolean;
  sample?: boolean;
  items: SavedLookItem[];
  share?: { active: boolean; expiresLabel?: string };
};

function ItemImage({
  src,
  alt,
  sizes = "80px",
}: {
  src?: string | null;
  alt: string;
  sizes?: string;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return (
    <span className="relative block aspect-square overflow-hidden rounded-lg bg-sand">
      {src && failedSource !== src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          unoptimized
          className="object-contain"
          onError={() => setFailedSource(src)}
        />
      ) : (
        <span
          role="img"
          aria-label={alt + ", image unavailable"}
          className="flex size-full items-center justify-center"
        >
          <Icon name="image" className="size-5 text-secondary" />
        </span>
      )}
    </span>
  );
}

export function SavedLookAvatar({
  look,
  onRetry,
  busy = false,
  onRefresh,
  detail = false,
}: {
  look: SavedLook;
  onRetry?: (id: string) => void;
  busy?: boolean;
  onRefresh?: () => void;
  detail?: boolean;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const geometry = detail ? "aspect-[3/4] md:aspect-[2/3]" : "aspect-[3/4]";
  if (look.avatarUrl && failedSource !== look.avatarUrl) {
    return (
      <div
        className={"relative overflow-hidden rounded-2xl bg-sand " + geometry}
      >
        <Image
          src={look.avatarUrl}
          alt={"Illustrative avatar for " + look.title}
          fill
          sizes={
            detail
              ? "(max-width: 768px) 100vw, 420px"
              : "(max-width: 640px) 50vw, 280px"
          }
          unoptimized
          className="object-cover"
          onError={() => setFailedSource(look.avatarUrl ?? null)}
        />
        <span className="absolute left-3 top-3 rounded-full bg-paper px-2 py-1 text-xs">
          <Icon name="sparkle" className="mr-1 inline size-3 text-crimson" />
          Illustrative avatar
        </span>
        {look.mediaStatus !== "succeeded" && (
          <div
            role="status"
            className="absolute inset-x-3 bottom-3 rounded-xl bg-paper p-3 text-sm"
          >
            <p>
              {look.mediaStatus === "queued" || look.mediaStatus === "running"
                ? "New image preparing. Showing the previous image."
                : look.mediaStatus === "cancelled"
                  ? "New image cancelled. Showing the previous image."
                  : look.mediaStatus === "superseded"
                    ? "New image out of date. Showing the previous image."
                    : "New image unavailable. Showing the previous image."}
            </p>
            {look.canRetry && onRetry && (
              <Button
                variant="quiet"
                disabled={busy}
                onClick={() => onRetry(look.id)}
              >
                Retry image
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }
  const failed = look.mediaStatus === "failed";
  const pending =
    look.mediaStatus === "queued" || look.mediaStatus === "running";
  return (
    <div
      role="status"
      className={
        "flex flex-col items-center justify-center gap-3 rounded-2xl p-3 text-center sm:p-5 " +
        geometry +
        " " +
        (failed ? "bg-blush" : "bg-sand")
      }
    >
      <div className="flex max-w-48 gap-1.5">
        {look.items.slice(0, 3).map((item) => (
          <span key={item.id} className="w-14">
            <ItemImage src={item.imageUrl} alt={item.name} />
          </span>
        ))}
      </div>
      <p className="rounded-full bg-paper px-3 py-1 text-xs font-medium">
        <Icon
          name={failed ? "info" : "sparkle"}
          className="mr-1 inline size-3 text-crimson"
        />
        {failed
          ? "Avatar could not be made"
          : pending
            ? "Look saved, avatar preparing"
            : look.mediaStatus === "cancelled"
              ? "Image generation cancelled"
              : "Avatar image unavailable"}
      </p>
      {failed ? (
        onRetry &&
        look.canRetry && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => onRetry(look.id)}
          >
            {busy ? "Retrying image" : "Retry image"}
          </Button>
        )
      ) : pending ? (
        <div className="h-1.5 w-24 animate-pulse rounded-full bg-paper motion-reduce:animate-none" />
      ) : onRefresh ? (
        <Button variant="secondary" disabled={busy} onClick={onRefresh}>
          Refresh image
        </Button>
      ) : null}
    </div>
  );
}

export function SavedLooksGallery({
  looks,
  onOpen,
  onRetryImage,
  onShare,
  filter: controlledFilter,
  counts,
  onFilterChange,
  getLookHref,
  renderShare,
  busyId,
  changingView = false,
}: {
  looks: SavedLook[];
  onOpen?: (id: string) => void;
  onRetryImage?: (id: string) => void;
  onShare?: (id: string) => void;
  filter?: "all" | "shared" | "preparing";
  counts?: { all: number; shared: number; preparing: number };
  onFilterChange?: (filter: "all" | "shared" | "preparing") => void;
  getLookHref?: (id: string) => string;
  renderShare?: (look: SavedLook) => ReactNode;
  busyId?: string | null;
  changingView?: boolean;
}) {
  const [localFilter, setLocalFilter] = useState<
    "all" | "shared" | "preparing"
  >("all");
  const filter = controlledFilter ?? localFilter;
  const setFilter = (next: "all" | "shared" | "preparing") =>
    onFilterChange ? onFilterChange(next) : setLocalFilter(next);
  const totals = counts ?? {
    all: looks.length,
    shared: looks.filter((look) => look.share?.active).length,
    preparing: looks.filter(
      (look) => look.mediaStatus === "queued" || look.mediaStatus === "running",
    ).length,
  };
  const filtered = controlledFilter
    ? looks
    : looks.filter(
        (look) =>
          filter === "all" ||
          (filter === "shared"
            ? look.share?.active
            : look.mediaStatus === "queued" || look.mediaStatus === "running"),
      );
  return (
    <section>
      <header>
        <p className="text-xs font-medium text-crimson">Your collection</p>
        <h1 className="mt-2 font-serif text-4xl md:text-5xl">
          Saved <em className="text-crimson">looks.</em>
        </h1>
        <p className="mt-2 text-sm text-secondary">
          Every look keeps the exact pieces you chose and gets its own avatar
          image.
        </p>
      </header>
      <div
        role="group"
        aria-label="Filter saved looks"
        className="mt-5 flex gap-2"
      >
        <Chip
          selected={filter === "all"}
          disabled={changingView}
          onClick={() => setFilter("all")}
        >
          All {totals.all}
        </Chip>
        <Chip
          selected={filter === "shared"}
          disabled={changingView}
          onClick={() => setFilter("shared")}
        >
          Shared {totals.shared}
        </Chip>
        <Chip
          selected={filter === "preparing"}
          disabled={changingView}
          onClick={() => setFilter("preparing")}
        >
          Preparing {totals.preparing}
        </Chip>
      </div>
      {changingView && (
        <p role="status" className="mt-3 text-sm text-secondary">
          Loading saved looks…
        </p>
      )}
      {filtered.length ? (
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 xl:grid-cols-4">
          {filtered.map((look) => (
            <article key={look.id} className="min-w-0">
              {getLookHref ? (
                <Link
                  href={getLookHref(look.id)}
                  className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-crimson"
                >
                  <SavedLookAvatar look={look} />
                  <h2 className="mt-2 break-words font-serif text-xl leading-tight">
                    {look.title}
                  </h2>
                  {look.sample && (
                    <span className="mt-1 block text-xs text-crimson">
                      Sample look
                    </span>
                  )}
                  <p className="mt-1 text-xs text-secondary">
                    Saved {look.savedAt}
                  </p>
                  {look.subtitle && (
                    <p className="mt-1 line-clamp-2 text-xs text-secondary">
                      {look.subtitle}
                    </p>
                  )}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpen?.(look.id)}
                  className="block w-full rounded-2xl text-left focus-visible:outline-2 focus-visible:outline-crimson"
                >
                  <SavedLookAvatar look={look} />
                  <h2 className="mt-2 font-serif text-xl leading-tight">
                    {look.title}
                  </h2>
                  {look.subtitle && (
                    <p className="mt-1 line-clamp-2 text-xs text-secondary">
                      {look.subtitle}
                    </p>
                  )}
                </button>
              )}
              {look.mediaStatus === "failed" &&
                look.canRetry &&
                onRetryImage && (
                  <div className="mt-2">
                    <Button
                      variant="secondary"
                      disabled={busyId === look.id}
                      onClick={() => onRetryImage(look.id)}
                    >
                      {busyId === look.id ? "Retrying image" : "Retry image"}
                    </Button>
                  </div>
                )}
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  {look.items.slice(0, 4).map((item) => (
                    <span key={item.id} className="w-8">
                      <ItemImage
                        src={item.imageUrl}
                        alt={item.name}
                        sizes="32px"
                      />
                    </span>
                  ))}
                </div>
                {renderShare && (
                  <span className="hidden shrink-0 xl:block">
                    {renderShare(look)}
                  </span>
                )}
                {onShare && look.mediaStatus === "succeeded" && (
                  <button
                    type="button"
                    aria-label={"Share " + look.title}
                    onClick={() => onShare(look.id)}
                    className="flex size-10 items-center justify-center rounded-full hover:bg-blush"
                  >
                    <Icon name="share" className="size-4" />
                  </button>
                )}
              </div>
              {look.share?.active && (
                <p className="mt-1 text-xs text-crimson">
                  <Icon name="link" className="mr-1 inline size-3" />
                  Shared
                  {look.share.expiresLabel
                    ? ", " + look.share.expiresLabel
                    : ""}
                </p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-stone bg-paper p-8 text-center">
          <Icon name="bookmark" className="mx-auto size-8 text-crimson" />
          <h2 className="mt-3 font-serif text-2xl">
            {filter === "all" ? "No saved looks yet" : "No looks in this view"}
          </h2>
          <p className="mt-2 text-sm text-secondary">
            Save a look to keep its pieces and prepare an illustrative avatar.
          </p>
        </div>
      )}
    </section>
  );
}

export function SavedLookDetail({
  look,
  busy = false,
  onRetryImage,
  onRegenerateImage,
  onPreview,
  onDelete,
  onShare,
  onManageShare,
  onAddToCapsule,
  writesEnabled = true,
  shareAction,
  manageShareAction,
  onRefresh,
}: {
  look: SavedLook;
  busy?: boolean;
  onRetryImage?: (id: string) => void;
  onRegenerateImage?: (id: string) => void;
  onPreview?: (id: string) => void;
  onDelete?: (id: string) => void | Promise<void>;
  onShare?: (id: string) => void;
  onManageShare?: (id: string) => void;
  onAddToCapsule?: (id: string) => void;
  writesEnabled?: boolean;
  shareAction?: ReactNode;
  manageShareAction?: ReactNode;
  onRefresh?: () => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  async function confirmDelete() {
    if (!onDelete || !writesEnabled || busy) return;
    setDeleteError(null);
    try {
      await onDelete(look.id);
      setDeleteOpen(false);
    } catch {
      setDeleteError("This saved look could not be deleted. Try again.");
    }
  }
  return (
    <article className="grid items-start gap-6 pb-20 md:grid-cols-[minmax(280px,420px)_minmax(0,1fr)] md:gap-8 md:pb-0">
      <div>
        <SavedLookAvatar
          look={look}
          onRetry={writesEnabled ? onRetryImage : undefined}
          busy={busy}
          onRefresh={onRefresh}
          detail
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {look.avatarUrl && (
            <Button
              variant="secondary"
              disabled={
                !writesEnabled ||
                busy ||
                !onRegenerateImage ||
                ["queued", "running"].includes(look.mediaStatus)
              }
              onClick={() => onRegenerateImage?.(look.id)}
            >
              Regenerate image
            </Button>
          )}
          {onPreview && (
            <Button variant="quiet" onClick={() => onPreview(look.id)}>
              Open in preview
            </Button>
          )}
          {!onPreview && (
            <Button variant="quiet" disabled>
              Open in preview
            </Button>
          )}
        </div>
      </div>
      <div>
        <p className="text-xs text-crimson">
          Saved {look.savedAt}
          {look.sample ? " · Sample look" : ""}
        </p>
        <h1 className="mt-2 font-serif text-4xl leading-tight md:text-5xl">
          {look.title}
        </h1>
        {look.share?.active && (
          <div className="mt-4 flex w-full min-h-11 flex-wrap items-center justify-between gap-2 rounded-xl bg-owned-bg px-4 py-2 text-sm text-owned">
            <span>
              <Icon name="link" className="mr-2 inline size-4" />
              Shared link active
              {look.share.expiresLabel ? ", " + look.share.expiresLabel : ""}
            </span>
            {manageShareAction ??
              (onManageShare ? (
                <Button
                  variant="quiet"
                  disabled={!writesEnabled || busy}
                  onClick={() => onManageShare(look.id)}
                >
                  Manage
                </Button>
              ) : null)}
          </div>
        )}
        <ul className="mt-4 space-y-2">
          {look.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-stone bg-paper p-2"
            >
              <span className="w-12 shrink-0">
                <ItemImage src={item.imageUrl} alt={item.name} sizes="48px" />
              </span>
              <span className="min-w-0 flex-1 break-words text-sm">
                {item.name}
              </span>
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
                {item.status === "owned"
                  ? "In your wardrobe"
                  : item.status === "candidate"
                    ? "Candidate, not owned"
                    : item.status === "alternative"
                      ? "Alternative"
                      : "Missing"}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-secondary">
          This is a snapshot from the day you saved it. Later wardrobe edits do
          not change it.
        </p>
        <div className="mt-5 hidden flex-wrap items-center justify-between gap-3 md:flex">
          {onDelete && (
            <Button
              variant="quiet"
              disabled={busy || !writesEnabled}
              onClick={() => setDeleteOpen(true)}
            >
              <Icon name="trash" className="mr-1 inline size-4" />
              Delete look
            </Button>
          )}
          <div className="flex gap-2">
            {onAddToCapsule && (
              <Button
                variant="secondary"
                onClick={() => onAddToCapsule(look.id)}
              >
                Add to capsule
              </Button>
            )}
            {!onAddToCapsule && (
              <Button
                variant="secondary"
                disabled
                title="Saved looks cannot be added to a capsule here yet."
              >
                Add to capsule
              </Button>
            )}
            {shareAction ??
              (onShare && (
                <Button
                  variant="primary"
                  disabled={
                    busy ||
                    !writesEnabled ||
                    look.mediaStatus !== "succeeded" ||
                    !look.avatarUrl
                  }
                  onClick={() => onShare(look.id)}
                >
                  Share
                </Button>
              ))}
          </div>
        </div>
        {onAddToCapsule && (
          <div className="mt-4 md:hidden">
            <Button variant="secondary" onClick={() => onAddToCapsule(look.id)}>
              Add to capsule
            </Button>
          </div>
        )}
        {(onShare || shareAction) &&
          (look.mediaStatus !== "succeeded" || !look.avatarUrl) && (
            <p className="mt-2 text-xs text-secondary">
              You can share the item composition now. Review and approve the
              overview image separately when it is ready.
            </p>
          )}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-stone bg-paper p-4 md:hidden">
        {onDelete ? (
          <Button
            variant="quiet"
            disabled={busy || !writesEnabled}
            onClick={() => setDeleteOpen(true)}
          >
            Delete look
          </Button>
        ) : (
          <span />
        )}
        {shareAction ??
          (onShare && (
            <Button
              variant="primary"
              disabled={
                busy ||
                !writesEnabled ||
                look.mediaStatus !== "succeeded" ||
                !look.avatarUrl
              }
              onClick={() => onShare(look.id)}
            >
              Share
            </Button>
          ))}
      </div>
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void confirmDelete()}
        title={"Delete “" + look.title + "”?"}
        description="This removes the saved look and its share link. It does not change your wardrobe."
        confirmLabel="Delete look"
        busy={busy}
      >
        {deleteError && (
          <p role="alert" className="mt-3 text-sm text-missing">
            {deleteError}
          </p>
        )}
      </ConfirmDialog>
    </article>
  );
}
