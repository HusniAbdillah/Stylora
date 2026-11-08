"use client";
import { withFeedback } from "@/lib/feedback/store";

import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { Button, ConfirmDialog, Icon, Logo, Skeleton } from "@/components/ui";

export type PublicShareItem = {
  id: string;
  name: string;
  imageUrl?: string | null;
};
export type PublicLook = {
  title: string;
  catchphrase?: string | null;
  avatarUrl?: string | null;
  avatarNotice?: string;
  items: PublicShareItem[];
  expiresLabel?: string | null;
};

function Brand({ logo }: { logo?: ReactNode }) {
  return <div>{logo ?? <Logo />}</div>;
}

function SharedImage({
  src,
  alt,
  avatar = false,
}: {
  src?: string | null;
  alt: string;
  avatar?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!src || failedUrl === src)
    return (
      <div className="flex size-full flex-col items-center justify-center gap-2 p-2 text-center text-xs text-secondary">
        {(avatar || !src) && (
          <Icon name="image" className={avatar ? "size-8" : "size-5"} />
        )}
        <span className={avatar ? "max-w-full break-words" : "sr-only"}>
          {src ? "Image unavailable" : alt}
        </span>
        {!avatar && !src && <span>No photo</span>}
        {src && (
          <Button
            variant="quiet"
            aria-label={`Reload image: ${alt}`}
            onClick={() => setFailedUrl(null)}
          >
            {avatar ? "Reload image" : "Retry"}
          </Button>
        )}
      </div>
    );
  return (
    <Image
      src={src}
      alt={alt}
      fill
      unoptimized
      sizes={
        avatar
          ? "(max-width: 1024px) 92vw, 520px"
          : "(max-width: 640px) 23vw, 142px"
      }
      loading={avatar ? "eager" : "lazy"}
      fetchPriority={avatar ? "high" : "auto"}
      onError={() => setFailedUrl(src)}
      className="object-contain"
    />
  );
}

function ItemGrid({
  items,
  compact = false,
}: {
  items: PublicShareItem[];
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "grid grid-cols-4 gap-1.5"
          : "grid max-w-[460px] grid-cols-4 gap-2 lg:grid-cols-3 lg:gap-3.5"
      }
    >
      {items.map((item) => (
        <div key={item.id} className="min-w-0">
          <div className="relative aspect-square overflow-hidden rounded-xl bg-paper">
            <SharedImage
              src={item.imageUrl}
              alt={item.imageUrl ? item.name : `No photo for ${item.name}`}
            />
          </div>
          <p
            className={
              compact
                ? "sr-only"
                : "mt-2 hidden break-words text-xs leading-tight sm:block"
            }
          >
            {item.name}
          </p>
        </div>
      ))}
    </div>
  );
}

function MakeLook({ onMakeLook }: { onMakeLook?: () => void }) {
  return onMakeLook ? (
    <Button variant="primary" onClick={onMakeLook}>
      Make your own look
    </Button>
  ) : (
    <Button variant="primary" asChild>
      <Link href="/create">Make your own look</Link>
    </Button>
  );
}

export function PublicShare({
  look,
  logo,
  onMakeLook,
}: {
  look: PublicLook;
  logo?: ReactNode;
  onMakeLook?: () => void;
}) {
  return (
    <main className="min-h-dvh bg-porcelain px-4 pb-12 pt-4 sm:px-10 lg:px-16">
      <header className="flex items-center justify-between gap-4">
        <Brand logo={logo} />
        <p className="text-xs text-secondary">A look shared from Stylora</p>
      </header>
      <div className="mx-auto mt-8 grid max-w-[1200px] items-center gap-5 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:gap-[72px]">
        <div className="relative aspect-[2/3] overflow-hidden rounded-3xl bg-sand">
          <SharedImage
            src={look.avatarUrl}
            alt={
              look.avatarUrl
                ? `Illustrative avatar for ${look.title}`
                : (look.avatarNotice ??
                  "No avatar was included in this shared look.")
            }
            avatar
          />
          {look.avatarUrl && (
            <span className="absolute left-3 top-3 rounded-full bg-paper px-3 py-1 text-xs">
              <Icon
                name="sparkle"
                className="mr-1 inline size-3 text-crimson"
              />
              Illustrative avatar
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="break-words font-serif text-[40px] leading-[1.05] lg:text-7xl">
            {look.title}
          </h1>
          {look.catchphrase && (
            <p className="mt-4 whitespace-pre-wrap break-words font-serif text-xl italic text-crimson lg:text-3xl">
              {look.catchphrase}
            </p>
          )}
          <div className="mt-5">
            <ItemGrid items={look.items} />
          </div>
          <div className="mt-6 [&>*]:w-full sm:[&>*]:w-auto">
            <MakeLook onMakeLook={onMakeLook} />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-secondary">
            {look.expiresLabel
              ? `Shared until ${look.expiresLabel}. This link can be turned off at any time.`
              : "Shared until the owner turns off this link."}
          </p>
        </div>
      </div>
    </main>
  );
}

export function ShareUnavailable({
  logo,
  onMakeLook,
}: {
  logo?: ReactNode;
  onMakeLook?: () => void;
}) {
  return (
    <main className="min-h-dvh bg-porcelain px-6 pt-4 sm:px-10 lg:px-16">
      <Brand logo={logo} />
      <div className="mx-auto mt-36 flex max-w-xl flex-col items-center text-center sm:mt-28">
        <span className="flex size-16 items-center justify-center rounded-full bg-blush text-crimson">
          <Icon name="link" className="size-8" />
        </span>
        <h1 className="mt-5 font-serif text-[32px] leading-tight sm:text-5xl">
          This look is no longer shared
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-secondary">
          The link was turned off or it expired.
        </p>
        <div className="mt-5 w-full [&>*]:w-full sm:w-auto">
          <MakeLook onMakeLook={onMakeLook} />
        </div>
      </div>
    </main>
  );
}

export function ShareReviewDialog({
  open,
  look,
  shareUrl,
  catchphrase,
  onCatchphraseChange,
  busy = false,
  loading = false,
  canPublish = true,
  error,
  children,
  onClose,
  onPublish,
  onTurnOff,
  managing = false,
  onCreateNew,
  confirmation,
}: {
  open: boolean;
  look: PublicLook | null;
  shareUrl?: string | null;
  catchphrase: string;
  onCatchphraseChange: (value: string) => void;
  busy?: boolean;
  loading?: boolean;
  canPublish?: boolean;
  error?: string | null;
  children?: ReactNode;
  onClose: () => void;
  onPublish: (values: { catchphrase: string }) => void;
  onTurnOff?: () => void;
  managing?: boolean;
  onCreateNew?: () => void;
  confirmation?: { content: ReactNode; onCancel: () => void };
}) {
  const safe = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const locked = busy || loading || !!shareUrl || !canPublish;
  async function copyLink() {
    if (!shareUrl) return;
    try {
      await withFeedback(
        {
          id: "copy-share-link",
          label: "Copy share link",
          success: "Link copied to the clipboard.",
        },
        () => navigator.clipboard.writeText(shareUrl),
      );
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  }
  function closeDialog() {
    setCopied(false);
    setCopyFailed(false);
    onClose();
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-night/45" />
        <Dialog.Content
          className={`fixed left-1/2 top-1/2 z-50 max-h-[92dvh] ${managing ? "w-[min(94vw,560px)]" : "w-[min(94vw,780px)]"} -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-stone bg-paper text-ink shadow-xl`}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            opener.current = document.activeElement as HTMLElement | null;
            safe.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (!confirmation) return;
            event.preventDefault();
            if (!busy) confirmation.onCancel();
          }}
        >
          <Dialog.Description className="sr-only">
            {managing
              ? "Manage published links. Their contents cannot be edited."
              : "Review exactly what this link will show before creating it. Closing the dialog hides the full link."}
          </Dialog.Description>
          <div
            className={`grid gap-5 p-5 ${managing ? "" : "sm:grid-cols-[0.85fr_1.15fr]"} sm:p-7`}
            aria-busy={loading}
          >
            {!managing && (
              <section
                className="min-w-0 rounded-2xl bg-porcelain p-4"
                aria-label="Exactly what people will see"
              >
                <p className="mb-3 text-xs text-secondary">
                  Exactly what people will see
                </p>
                {loading || !look ? (
                  <>
                    <Skeleton className="block aspect-[2/3] w-full rounded-xl" />
                    <Skeleton className="mt-3 block h-7 w-3/4" />
                  </>
                ) : (
                  <>
                    <div className="relative mx-auto aspect-[2/3] w-full max-w-44 overflow-hidden rounded-xl bg-sand sm:max-w-none">
                      <SharedImage
                        src={look.avatarUrl}
                        alt={
                          look.avatarUrl
                            ? `Illustrative avatar for ${look.title}`
                            : (look.avatarNotice ??
                              "No avatar is selected for this link.")
                        }
                        avatar
                      />
                    </div>
                    <h2 className="mt-3 break-words font-serif text-2xl">
                      {look.title}
                    </h2>
                    {catchphrase && (
                      <p className="mt-1 whitespace-pre-wrap break-words font-serif italic text-crimson">
                        {catchphrase}
                      </p>
                    )}
                    <div className="mt-3">
                      <ItemGrid items={look.items} compact />
                    </div>
                  </>
                )}
              </section>
            )}
            <section className="min-w-0">
              <div className="flex items-start justify-between gap-2">
                <Dialog.Title className="font-serif text-3xl">
                  {managing
                    ? "Manage sharing"
                    : shareUrl
                      ? "Your link is ready"
                      : "Share this look"}
                </Dialog.Title>
                <button
                  ref={safe}
                  type="button"
                  onClick={closeDialog}
                  aria-label="Close sharing dialog"
                  className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-blush active:bg-rose-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
                >
                  <Icon name="x" className="size-5" />
                </button>
              </div>
              {loading ? (
                <div
                  role="status"
                  aria-label="Preparing share preview"
                  className="mt-5 space-y-3"
                >
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-28 w-full rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : managing ? (
                <>
                  <p className="mt-3 text-sm leading-relaxed text-secondary">
                    Published links keep their original description and image.
                    Create a new link to share changes.
                  </p>
                  {children}
                </>
              ) : (
                !shareUrl && (
                  <>
                    <label className="mt-4 block text-sm">
                      Look description
                      <textarea
                        value={catchphrase}
                        maxLength={240}
                        rows={3}
                        disabled={locked}
                        onChange={(event) =>
                          onCatchphraseChange(event.target.value)
                        }
                        className="mt-2 min-h-24 w-full resize-y rounded-lg border border-secondary bg-paper px-3 py-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson disabled:opacity-70"
                      />
                    </label>
                    {children}
                    <p className="mt-5 text-xs leading-relaxed text-secondary">
                      Your link stays active until you turn it off.
                    </p>
                  </>
                )
              )}
              {error && (
                <p role="alert" className="mt-3 text-sm text-crimson">
                  {error}
                </p>
              )}
              {shareUrl && (
                <div className="mt-5 rounded-xl bg-blush p-4">
                  <label className="block text-xs">
                    Share link
                    <input
                      readOnly
                      aria-label="Share link"
                      value={shareUrl}
                      onFocus={(event) => event.currentTarget.select()}
                      className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-secondary bg-paper px-2 text-xs"
                    />
                  </label>
                  <Button
                    variant="secondary"
                    onClick={copyLink}
                    className="mt-3 w-full"
                  >
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                  <p className="mt-3 text-xs leading-relaxed text-secondary">
                    Save this link before closing. It cannot be shown again.
                  </p>
                  {copyFailed && (
                    <p role="status" className="mt-2 text-xs">
                      Copy did not work. Select the link above and copy it.
                    </p>
                  )}
                </div>
              )}
              <div className="mt-6 flex items-center justify-between gap-3">
                {managing && onCreateNew ? (
                  <Button
                    variant="secondary"
                    onClick={onCreateNew}
                    disabled={busy || loading || !look || !canPublish}
                  >
                    Create new link
                  </Button>
                ) : shareUrl && onTurnOff ? (
                  <Button
                    variant="quiet"
                    onClick={onTurnOff}
                    disabled={busy || !canPublish}
                  >
                    Turn off link
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  variant="primary"
                  disabled={
                    busy ||
                    loading ||
                    (!managing && (!look || (!shareUrl && !canPublish)))
                  }
                  onClick={() => {
                    if (managing || shareUrl) closeDialog();
                    else {
                      setCopied(false);
                      onPublish({
                        catchphrase: catchphrase.trim(),
                      });
                    }
                  }}
                >
                  {busy
                    ? "Saving…"
                    : managing || shareUrl
                      ? "Done"
                      : "Create link"}
                </Button>
              </div>
            </section>
          </div>
          {confirmation?.content}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ShareRevocationDialog({
  open,
  lookTitle,
  busy = false,
  error,
  onClose,
  onRevoke,
}: {
  open: boolean;
  lookTitle: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onRevoke: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onRevoke}
      title="Turn off this link?"
      description={
        <>
          The shared page for “{lookTitle}” will stop opening. People who
          already downloaded an image may still have their copy.
        </>
      }
      cancelLabel="Keep link"
      confirmLabel="Turn off link"
      busy={busy}
    >
      {error && (
        <p role="alert" className="text-sm text-crimson">
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}
