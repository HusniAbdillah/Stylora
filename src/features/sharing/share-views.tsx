"use client";

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
  expiresLabel?: string;
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
      className={avatar ? "object-cover" : "object-contain"}
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
        <div className="relative aspect-[3/4] overflow-hidden rounded-3xl bg-sand lg:aspect-[2/3]">
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
            <p className="mt-4 break-words font-serif text-xl italic text-crimson lg:text-3xl">
              {look.catchphrase}
            </p>
          )}
          <div className="mt-5">
            <ItemGrid items={look.items} />
          </div>
          <div className="mt-6 [&>*]:w-full sm:[&>*]:w-auto">
            <MakeLook onMakeLook={onMakeLook} />
          </div>
          {look.expiresLabel && (
            <p className="mt-4 text-xs leading-relaxed text-secondary">
              Shared until {look.expiresLabel}. This link can be turned off at
              any time.
            </p>
          )}
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
  initialCatchphrase = "",
  initialExpiryHours = 168,
  busy = false,
  loading = false,
  canPublish = true,
  error,
  children,
  onClose,
  onPublish,
  onTurnOff,
}: {
  open: boolean;
  look: PublicLook | null;
  shareUrl?: string | null;
  initialCatchphrase?: string;
  initialExpiryHours?: number;
  busy?: boolean;
  loading?: boolean;
  canPublish?: boolean;
  error?: string | null;
  children?: ReactNode;
  onClose: () => void;
  onPublish: (values: { catchphrase: string; expiryHours: number }) => void;
  onTurnOff?: () => void;
}) {
  const safe = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [catchphrase, setCatchphrase] = useState(initialCatchphrase);
  const [expiryHours, setExpiryHours] = useState(initialExpiryHours);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const locked = busy || loading || !!shareUrl || !canPublish;
  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
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
          className="fixed left-1/2 top-1/2 z-50 max-h-[92dvh] w-[min(94vw,780px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-stone bg-paper text-ink shadow-xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            opener.current = document.activeElement as HTMLElement | null;
            safe.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
        >
          <Dialog.Description className="sr-only">
            Review exactly what this link will show before creating it. Closing
            the dialog hides the full link.
          </Dialog.Description>
          <div
            className="grid gap-5 p-5 sm:grid-cols-[0.85fr_1.15fr] sm:p-7"
            aria-busy={loading}
          >
            <section
              className="min-w-0 rounded-2xl bg-porcelain p-4"
              aria-label="Exactly what people will see"
            >
              <p className="mb-3 text-xs text-secondary">
                Exactly what people will see
              </p>
              {loading || !look ? (
                <>
                  <Skeleton className="block aspect-[3/4] w-full rounded-xl" />
                  <Skeleton className="mt-3 block h-7 w-3/4" />
                </>
              ) : (
                <>
                  <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-sand">
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
                    <p className="mt-1 break-words font-serif italic text-crimson">
                      {catchphrase}
                    </p>
                  )}
                  <div className="mt-3">
                    <ItemGrid items={look.items} compact />
                  </div>
                </>
              )}
            </section>
            <section className="min-w-0">
              <div className="flex items-start justify-between gap-2">
                <Dialog.Title className="font-serif text-3xl">
                  Share this look
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
              {loading && (
                <p role="status" className="mt-3 text-sm text-secondary">
                  Loading the saved look and its links…
                </p>
              )}
              <label className="mt-4 block text-sm">
                Catchphrase
                <input
                  value={catchphrase}
                  maxLength={240}
                  disabled={locked}
                  onChange={(event) => setCatchphrase(event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-lg border border-secondary bg-paper px-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson disabled:opacity-70"
                />
              </label>
              <fieldset className="mt-4" disabled={locked}>
                <legend className="mb-2 text-sm">Link expires after</legend>
                <div className="flex flex-wrap gap-2">
                  {[24, 168, 720].map((hours) => (
                    <label
                      key={hours}
                      className={`relative flex min-h-11 cursor-pointer items-center rounded-full border px-3 py-2 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-crimson ${expiryHours === hours ? "border-crimson bg-blush" : "border-stone"}`}
                    >
                      <input
                        type="radio"
                        name="share-expiry"
                        value={hours}
                        checked={expiryHours === hours}
                        onChange={() => setExpiryHours(hours)}
                        className="sr-only"
                      />
                      {hours === 24
                        ? "1 day"
                        : hours === 168
                          ? "7 days"
                          : "30 days"}
                    </label>
                  ))}
                </div>
              </fieldset>
              {children}
              <div className="mt-5 rounded-xl bg-porcelain p-4 text-xs leading-relaxed">
                <p>
                  <Icon
                    name="check"
                    className="mr-1 inline size-3 text-crimson"
                  />
                  Shared: title, catchphrase, item names and available item
                  photos. Only an avatar you approve is included.
                </p>
                <p className="mt-2">
                  <Icon name="x" className="mr-1 inline size-3 text-crimson" />
                  Not included in this link: preferences, notes or other
                  wardrobe items.
                </p>
              </div>
              {error && (
                <p role="alert" className="mt-3 text-sm text-crimson">
                  {error}
                </p>
              )}
              {shareUrl && (
                <div className="mt-4 rounded-xl bg-blush p-3">
                  <label className="block text-xs">
                    New share link
                    <input
                      readOnly
                      aria-label="New share link"
                      value={shareUrl}
                      onFocus={(event) => event.currentTarget.select()}
                      className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-secondary bg-paper px-2 text-xs"
                    />
                  </label>
                  <Button variant="quiet" onClick={copyLink}>
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                  <p className="text-xs leading-relaxed text-secondary">
                    Copy it now. The full link is hidden when you close this
                    dialog.
                  </p>
                  {copyFailed && (
                    <p role="status" className="mt-2 text-xs">
                      Copy did not work. Select the link above and copy it.
                    </p>
                  )}
                </div>
              )}
              <div className="mt-6 flex items-center justify-between gap-3">
                {shareUrl && onTurnOff ? (
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
                    busy || loading || !look || (!shareUrl && !canPublish)
                  }
                  onClick={() => {
                    if (shareUrl) closeDialog();
                    else {
                      setCopied(false);
                      onPublish({
                        catchphrase: catchphrase.trim(),
                        expiryHours,
                      });
                    }
                  }}
                >
                  {busy ? "Saving…" : shareUrl ? "Done" : "Create link"}
                </Button>
              </div>
            </section>
          </div>
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
