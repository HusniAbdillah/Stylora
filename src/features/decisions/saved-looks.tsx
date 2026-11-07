"use client";

import Image from "next/image";
import { useState } from "react";
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
  mediaStatus: "queued" | "running" | "succeeded" | "failed";
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
  return (
    <span className="relative block aspect-square overflow-hidden rounded-lg bg-sand">
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          unoptimized
          className="object-contain"
        />
      ) : (
        <span className="flex size-full items-center justify-center">
          <Icon name="image" className="size-5 text-secondary" />
        </span>
      )}
    </span>
  );
}

export function SavedLookAvatar({
  look,
  onRetry,
}: {
  look: SavedLook;
  onRetry?: (id: string) => void;
}) {
  if (look.mediaStatus === "succeeded" && look.avatarUrl) {
    return (
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-sand">
        <Image
          src={look.avatarUrl}
          alt={"Illustrative avatar for " + look.title}
          fill
          sizes="(max-width: 640px) 50vw, 380px"
          unoptimized
          className="object-cover"
        />
        <span className="absolute left-3 top-3 rounded-full bg-paper px-2 py-1 text-xs">
          <Icon name="sparkle" className="mr-1 inline size-3 text-crimson" />
          Illustrative avatar
        </span>
      </div>
    );
  }
  const failed = look.mediaStatus === "failed";
  return (
    <div
      role="status"
      className={
        "flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-2xl p-5 text-center " +
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
        {failed ? "Avatar could not be made" : "Look saved, avatar preparing"}
      </p>
      {failed ? (
        onRetry && (
          <Button variant="secondary" onClick={() => onRetry(look.id)}>
            Retry image
          </Button>
        )
      ) : (
        <div className="h-1.5 w-24 animate-pulse rounded-full bg-paper motion-reduce:animate-none" />
      )}
    </div>
  );
}

export function SavedLooksGallery({
  looks,
  onOpen,
  onRetryImage,
  onShare,
}: {
  looks: SavedLook[];
  onOpen?: (id: string) => void;
  onRetryImage?: (id: string) => void;
  onShare?: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "shared" | "preparing">("all");
  const filtered = looks.filter(
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
        <Chip selected={filter === "all"} onClick={() => setFilter("all")}>
          All {looks.length}
        </Chip>
        <Chip
          selected={filter === "shared"}
          onClick={() => setFilter("shared")}
        >
          Shared {looks.filter((look) => look.share?.active).length}
        </Chip>
        <Chip
          selected={filter === "preparing"}
          onClick={() => setFilter("preparing")}
        >
          Preparing{" "}
          {
            looks.filter(
              (look) =>
                look.mediaStatus === "queued" || look.mediaStatus === "running",
            ).length
          }
        </Chip>
      </div>
      {filtered.length ? (
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
          {filtered.map((look) => (
            <article key={look.id} className="min-w-0">
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
              {look.mediaStatus === "failed" && onRetryImage && (
                <div className="mt-2">
                  <Button
                    variant="secondary"
                    onClick={() => onRetryImage(look.id)}
                  >
                    Retry image
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
  onPreview,
  onDelete,
  onShare,
  onManageShare,
  onAddToCapsule,
}: {
  look: SavedLook;
  busy?: boolean;
  onRetryImage?: (id: string) => void;
  onPreview?: (id: string) => void;
  onDelete?: (id: string) => void;
  onShare?: (id: string) => void;
  onManageShare?: (id: string) => void;
  onAddToCapsule?: (id: string) => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  return (
    <article className="grid items-start gap-6 pb-20 md:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)] md:pb-0">
      <div>
        <SavedLookAvatar look={look} onRetry={onRetryImage} />
        <div className="mt-3 flex flex-wrap gap-2">
          {onRetryImage && look.mediaStatus === "succeeded" && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => onRetryImage(look.id)}
            >
              Regenerate image
            </Button>
          )}
          {onPreview && (
            <Button variant="quiet" onClick={() => onPreview(look.id)}>
              Open in preview
            </Button>
          )}
        </div>
      </div>
      <div>
        <p className="text-xs text-crimson">Saved {look.savedAt}</p>
        <h1 className="mt-2 font-serif text-4xl leading-tight md:text-5xl">
          {look.title}
        </h1>
        {look.share?.active && (
          <button
            type="button"
            onClick={() => onManageShare?.(look.id)}
            className="mt-4 flex w-full min-h-11 items-center justify-between rounded-xl bg-[var(--color-status-owned-bg,var(--color-blush))] px-4 text-sm text-[var(--color-status-owned,var(--color-ink))]"
          >
            <span>
              <Icon name="link" className="mr-2 inline size-4" />
              Shared link active
              {look.share.expiresLabel ? ", " + look.share.expiresLabel : ""}
            </span>
            <span>Manage</span>
          </button>
        )}
        <ul className="mt-4 space-y-2">
          {look.items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-stone bg-paper p-2"
            >
              <span className="w-12 shrink-0">
                <ItemImage src={item.imageUrl} alt={item.name} sizes="48px" />
              </span>
              <span className="min-w-0 flex-1 text-sm">{item.name}</span>
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
            <Button variant="quiet" onClick={() => setDeleteOpen(true)}>
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
            {onShare && (
              <Button
                variant="primary"
                disabled={look.mediaStatus !== "succeeded" || !look.avatarUrl}
                onClick={() => onShare(look.id)}
              >
                Share
              </Button>
            )}
          </div>
        </div>
        {onAddToCapsule && (
          <div className="mt-4 md:hidden">
            <Button variant="secondary" onClick={() => onAddToCapsule(look.id)}>
              Add to capsule
            </Button>
          </div>
        )}
        {onShare && look.mediaStatus !== "succeeded" && (
          <p className="mt-2 text-xs text-secondary">
            Sharing is available when the avatar is ready.
          </p>
        )}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-stone bg-paper p-4 md:hidden">
        {onDelete ? (
          <Button variant="quiet" onClick={() => setDeleteOpen(true)}>
            Delete look
          </Button>
        ) : (
          <span />
        )}
        {onShare && (
          <Button
            variant="primary"
            disabled={look.mediaStatus !== "succeeded" || !look.avatarUrl}
            onClick={() => onShare(look.id)}
          >
            Share
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          onDelete?.(look.id);
        }}
        title={"Delete “" + look.title + "”?"}
        description="This removes the saved look and its share link. It does not change your wardrobe."
        confirmLabel="Delete look"
        busy={busy}
      />
    </article>
  );
}
