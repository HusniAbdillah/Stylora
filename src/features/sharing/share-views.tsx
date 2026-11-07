"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, ConfirmDialog, Icon, Logo } from "@/components/ui";

export type PublicShareItem = {
  id: string;
  name: string;
  imageUrl?: string | null;
};

export type PublicLook = {
  title: string;
  catchphrase?: string | null;
  avatarUrl: string;
  items: PublicShareItem[];
  expiresLabel?: string;
};

function Brand({ logo }: { logo?: ReactNode }) {
  return <div>{logo ?? <Logo />}</div>;
}

function ItemGrid({ items }: { items: PublicShareItem[] }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((item) => (
        <div key={item.id} className="min-w-0">
          <div className="relative aspect-square overflow-hidden rounded-xl bg-sand">
            {item.imageUrl ? (
              <Image
                src={item.imageUrl}
                alt={item.name}
                fill
                sizes="(max-width: 640px) 25vw, 110px"
                unoptimized
                className="object-contain"
              />
            ) : (
              <span className="flex size-full items-center justify-center text-secondary">
                <Icon name="image" className="size-5" />
              </span>
            )}
          </div>
          <p className="mt-1 hidden text-xs leading-tight sm:block">
            {item.name}
          </p>
        </div>
      ))}
    </div>
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
    <main className="min-h-dvh bg-porcelain px-4 pb-12 pt-4 sm:px-10">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Brand logo={logo} />
        <p className="text-xs text-secondary">A look shared from Stylora</p>
      </header>
      <div className="mx-auto mt-10 grid max-w-6xl items-center gap-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-14">
        <div className="relative aspect-[3/4] overflow-hidden rounded-3xl bg-sand">
          <Image
            src={look.avatarUrl}
            alt={"Illustrative avatar for " + look.title}
            fill
            sizes="(max-width: 768px) 90vw, 500px"
            unoptimized
            className="object-cover"
          />
          <span className="absolute left-3 top-3 rounded-full bg-paper px-3 py-1 text-xs">
            <Icon name="sparkle" className="mr-1 inline size-3 text-crimson" />
            Illustrative avatar
          </span>
        </div>
        <div>
          <h1 className="font-serif text-5xl leading-tight md:text-6xl">
            {look.title}
          </h1>
          {look.catchphrase && (
            <p className="mt-4 font-serif text-2xl italic text-crimson">
              {look.catchphrase}
            </p>
          )}
          <div className="mt-5 max-w-md">
            <ItemGrid items={look.items} />
          </div>
          <div className="mt-6">
            <Button variant="primary" onClick={onMakeLook}>
              Make your own look
            </Button>
          </div>
          {look.expiresLabel && (
            <p className="mt-4 text-xs text-secondary">
              Shared until {look.expiresLabel}. The owner can turn this link off
              at any time.
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
    <main className="min-h-dvh bg-porcelain px-6 pt-4">
      <div className="mx-auto max-w-6xl">
        <Brand logo={logo} />
      </div>
      <div className="mx-auto mt-24 flex max-w-lg flex-col items-center text-center sm:mt-32">
        <span className="flex size-16 items-center justify-center rounded-full bg-blush text-crimson">
          <Icon name="link" className="size-8" />
        </span>
        <h1 className="mt-5 font-serif text-4xl md:text-5xl">
          This look is no longer shared
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-secondary">
          The owner turned off this link or it expired.
        </p>
        <div className="mt-5 w-full sm:w-auto">
          <Button variant="primary" onClick={onMakeLook}>
            Make your own look
          </Button>
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
  onClose,
  onPublish,
  onTurnOff,
}: {
  open: boolean;
  look: PublicLook;
  shareUrl?: string | null;
  initialCatchphrase?: string;
  initialExpiryHours?: number;
  busy?: boolean;
  onClose: () => void;
  onPublish: (values: { catchphrase: string; expiryHours: number }) => void;
  onTurnOff?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const safeRef = useRef<HTMLButtonElement>(null);
  const [catchphrase, setCatchphrase] = useState(initialCatchphrase);
  const [expiryHours, setExpiryHours] = useState(initialExpiryHours);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      safeRef.current?.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      aria-label="Share this look"
      className="m-auto w-[min(92vw,780px)] max-h-[90dvh] overflow-y-auto rounded-3xl border border-stone bg-paper p-0 text-ink shadow-xl backdrop:bg-night/40"
    >
      <div className="grid gap-5 p-5 sm:grid-cols-[0.85fr_1.15fr] sm:p-7">
        <section
          className="rounded-2xl bg-porcelain p-4"
          aria-label="Exactly what people will see"
        >
          <p className="mb-3 text-xs text-secondary">
            Exactly what people will see
          </p>
          <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-sand">
            <Image
              src={look.avatarUrl}
              alt={"Illustrative avatar for " + look.title}
              fill
              sizes="300px"
              unoptimized
              className="object-cover"
            />
          </div>
          <h2 className="mt-3 font-serif text-2xl">{look.title}</h2>
          {catchphrase && (
            <p className="mt-1 font-serif italic text-crimson">{catchphrase}</p>
          )}
          <div className="mt-2">
            <ItemGrid items={look.items} />
          </div>
        </section>
        <section>
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-serif text-3xl">Share this look</h2>
            <button
              ref={safeRef}
              type="button"
              onClick={onClose}
              aria-label="Close sharing dialog"
              className="flex size-10 items-center justify-center rounded-full hover:bg-blush"
            >
              <Icon name="x" className="size-5" />
            </button>
          </div>
          <label className="mt-4 block text-sm">
            Catchphrase
            <input
              value={catchphrase}
              maxLength={240}
              onChange={(event) => setCatchphrase(event.target.value)}
              className="mt-2 h-11 w-full rounded-lg border border-stone bg-paper px-3 outline-none focus-visible:border-crimson"
            />
          </label>
          <fieldset className="mt-4">
            <legend className="mb-2 text-sm">Link expires after</legend>
            <div className="flex flex-wrap gap-2">
              {[24, 168, 720].map((hours) => (
                <label
                  key={hours}
                  className={
                    "cursor-pointer rounded-full border px-3 py-2 text-sm " +
                    (expiryHours === hours
                      ? "border-crimson bg-blush"
                      : "border-stone")
                  }
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
          <div className="mt-5 rounded-xl bg-porcelain p-4 text-xs leading-relaxed">
            <p>
              <Icon name="check" className="mr-1 inline size-3 text-crimson" />
              Shared: avatar, title, catchphrase and item names in this look.
            </p>
            <p className="mt-2">
              <Icon name="x" className="mr-1 inline size-3 text-crimson" />
              Never shared: preferences, notes, private paths or the rest of
              your wardrobe.
            </p>
          </div>
          {shareUrl && (
            <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-[var(--color-status-owned-bg,var(--color-blush))] p-3">
              <span className="min-w-0 truncate text-xs">{shareUrl}</span>
              <button
                type="button"
                onClick={copyLink}
                className="shrink-0 text-sm font-medium text-crimson"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
          <div className="mt-6 flex items-center justify-between gap-3">
            {shareUrl && onTurnOff ? (
              <Button variant="quiet" onClick={onTurnOff}>
                Turn off link
              </Button>
            ) : (
              <span />
            )}
            <Button
              variant="primary"
              disabled={busy}
              onClick={() =>
                shareUrl
                  ? onClose()
                  : onPublish({ catchphrase: catchphrase.trim(), expiryHours })
              }
            >
              {busy ? "Preparing…" : shareUrl ? "Done" : "Create link"}
            </Button>
          </div>
        </section>
      </div>
    </dialog>
  );
}

export function ShareRevocationDialog({
  open,
  lookTitle,
  busy = false,
  onClose,
  onRevoke,
}: {
  open: boolean;
  lookTitle: string;
  busy?: boolean;
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
    />
  );
}
