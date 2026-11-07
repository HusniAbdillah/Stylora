"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { BrowserApiError, requestData } from "@/lib/browser-api";
import type { getSavedLook } from "@/features/decisions/server";
import type { createShare, listShares } from "./server";
import { initialLookDescription } from "./schema";
import {
  ShareReviewDialog,
  ShareRevocationDialog,
  type PublicLook,
} from "./share-views";

type SavedLook = Awaited<ReturnType<typeof getSavedLook>>;
type SharePage = Awaited<ReturnType<typeof listShares>>;
type ShareMetadata = SharePage["shares"][number];
type CreatedShare = Awaited<ReturnType<typeof createShare>>;
type Props = {
  savedLookId: string;
  label?: string;
  onChanged?: () => void;
  writesEnabled?: boolean;
  mode?: "create" | "manage";
};

function message(error: unknown) {
  return error instanceof BrowserApiError
    ? error.message
    : "Sharing could not be updated. Try again.";
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      }).format(date);
}

export function ShareManager(props: Props) {
  return <SharingSession key={props.savedLookId} {...props} />;
}

function SharingSession({
  savedLookId,
  label = "Share this look",
  onChanged,
  writesEnabled = true,
  mode = "create",
}: Props) {
  const [open, setOpen] = useState(false);
  const [managing, setManaging] = useState(mode === "manage");
  const [saved, setSaved] = useState<SavedLook | null>(null);
  const [shares, setShares] = useState<ShareMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const descriptionInitialized = useRef(false);
  const [published, setPublished] = useState<{
    id: string;
    url: string;
  } | null>(null);
  const [revoking, setRevoking] = useState<ShareMetadata | null>(null);
  const session = useRef(0);
  const mutation = useRef(false);
  useEffect(
    () => () => {
      session.current += 1;
    },
    [],
  );

  async function load() {
    const current = ++session.current;
    setLoading(true);
    setError(null);
    setSaved(null);
    try {
      const [look, page] = await Promise.all([
        requestData<SavedLook>(`/api/saved-looks/${savedLookId}`),
        requestData<SharePage>(
          `/api/saved-looks/${savedLookId}/shares?limit=20`,
        ),
      ]);
      if (current !== session.current) return;
      setSaved(look);
      setShares(page.shares);
      if (!descriptionInitialized.current) {
        setDescription(
          initialLookDescription(
            look.items,
            page.shares.find((share) => share.catchphrase.trim())?.catchphrase,
          ),
        );
        descriptionInitialized.current = true;
      }
      setHasMore(page.shares.length === page.limit);
    } catch (failure) {
      if (current === session.current) setError(message(failure));
    } finally {
      if (current === session.current) setLoading(false);
    }
  }

  function close() {
    session.current += 1;
    setOpen(false);
    setPublished(null);
    setRevoking(null);
    setLoading(false);
    setLoadingMore(false);
    setError(null);
  }

  async function openManager() {
    setManaging(mode === "manage");
    setOpen(true);
    setPublished(null);
    setRevoking(null);
    setRevokeError(null);
    await load();
  }

  async function loadMore() {
    if (loadingMore) return;
    const current = session.current;
    setLoadingMore(true);
    try {
      const page = await requestData<SharePage>(
        `/api/saved-looks/${savedLookId}/shares?limit=20&offset=${shares.length}`,
      );
      if (current !== session.current) return;
      setShares((previous) => [
        ...previous,
        ...page.shares.filter(
          (share) => !previous.some((entry) => entry.id === share.id),
        ),
      ]);
      setHasMore(page.shares.length === page.limit);
    } catch (failure) {
      if (current === session.current) setError(message(failure));
    } finally {
      if (current === session.current) setLoadingMore(false);
    }
  }

  async function publish(values: { catchphrase: string }) {
    if (mutation.current || !writesEnabled || !saved || managing) return;
    mutation.current = true;
    setBusy(true);
    setError(null);
    const current = session.current;
    try {
      const created = await requestData<CreatedShare>(
        `/api/saved-looks/${savedLookId}/shares`,
        {
          method: "POST",
          body: JSON.stringify({
            catchphrase: values.catchphrase,
            approvedMediaIds: readyMediaId ? [readyMediaId] : [],
          }),
        },
      );
      if (current === session.current) {
        setPublished({
          id: created.id,
          url: new URL(created.publicPath, window.location.origin).href,
        });
        setShares((previous) => [
          {
            id: created.id,
            catchphrase: created.catchphrase,
            createdAt: created.createdAt,
            expiresAt: created.expiresAt,
            revokedAt: created.revokedAt,
            status: created.status,
            approvedMediaCount: created.approvedMediaCount,
            publicSnapshot: created.publicSnapshot,
          },
          ...previous,
        ]);
      }
      onChanged?.();
    } catch (failure) {
      if (current === session.current) setError(message(failure));
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }

  async function revoke() {
    if (!revoking || mutation.current || !writesEnabled) return;
    mutation.current = true;
    setBusy(true);
    setRevokeError(null);
    const current = session.current;
    try {
      const updated = await requestData<ShareMetadata>(
        `/api/shares/${revoking.id}`,
        { method: "DELETE" },
      );
      if (current === session.current) {
        setShares((previous) =>
          previous.map((share) => (share.id === updated.id ? updated : share)),
        );
        if (published?.id === updated.id) setPublished(null);
        setRevoking(null);
      }
      onChanged?.();
    } catch (failure) {
      if (current === session.current) setRevokeError(message(failure));
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }

  const readyMediaId =
    saved?.media.status === "succeeded" && saved.media.imageUrl
      ? saved.media.id
      : null;
  const look: PublicLook | null = saved
    ? {
        title: saved.title,
        avatarUrl: readyMediaId ? saved.media.imageUrl : null,
        avatarNotice: "No completed avatar yet. Your saved items are included.",
        items: saved.items.map((item, index) => ({
          id: String(index),
          name:
            typeof item.name === "string" ? item.name : "Item name unavailable",
          imageUrl: item.assetId ? item.imageUrl : null,
        })),
      }
    : null;

  return (
    <>
      <Button
        variant="secondary"
        className="min-w-24 justify-center"
        disabled={busy}
        aria-busy={busy}
        onClick={() => void openManager()}
      >
        {busy && !open ? "Updating link…" : label}
      </Button>
      <ShareReviewDialog
        open={open}
        look={look}
        shareUrl={published?.url}
        loading={loading}
        busy={busy}
        canPublish={writesEnabled}
        managing={managing}
        onCreateNew={() => setManaging(false)}
        catchphrase={description}
        onCatchphraseChange={setDescription}
        error={error}
        onClose={close}
        onPublish={(values) => void publish(values)}
        onTurnOff={
          published
            ? () => {
                setRevokeError(null);
                setRevoking(
                  shares.find((share) => share.id === published.id) ?? null,
                );
              }
            : undefined
        }
      >
        {!writesEnabled && (
          <p
            role="status"
            className="mt-4 rounded-xl bg-porcelain p-3 text-sm text-secondary"
          >
            Viewing only. Creating or turning off links is unavailable.
          </p>
        )}
        {!loading && !saved && error && (
          <Button
            variant="secondary"
            onClick={() => void load()}
            className="mt-3"
          >
            Retry loading
          </Button>
        )}
        {saved && !published && shares.length === 0 && managing && (
          <p className="mt-4 text-sm text-secondary">
            No shared links for this look.
          </p>
        )}
        {saved && !published && shares.length > 0 && (
          <details open={managing} className="mt-5 border-t border-stone pt-3">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson">
              {managing ? "Published links" : "Previous links"} ({shares.length}
              {hasMore ? "+" : ""})
            </summary>
            <ul className="mt-3 space-y-2">
              {shares.map((share) => (
                <li
                  key={share.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-porcelain px-3 py-2"
                >
                  <div className="min-w-0">
                    {managing && (
                      <p className="mb-1 break-words text-sm font-medium">
                        {share.publicSnapshot.title}
                      </p>
                    )}
                    <p className="text-xs font-medium">
                      {share.status === "revoked"
                        ? "Turned off"
                        : share.status === "expired"
                          ? "Expired"
                          : "Active"}
                    </p>
                    <p className="mt-1 text-xs text-secondary">
                      {share.revokedAt
                        ? `Turned off ${formatTime(share.revokedAt)}`
                        : share.expiresAt
                          ? `${share.status === "expired" ? "Expired" : "Expires"} ${formatTime(share.expiresAt)}`
                          : `Created ${formatTime(share.createdAt)}`}
                    </p>
                  </div>
                  {managing && share.catchphrase && (
                    <p className="order-last w-full whitespace-pre-wrap break-words pb-1 text-sm text-secondary">
                      {share.catchphrase}
                    </p>
                  )}
                  {share.status === "active" && (
                    <Button
                      variant="quiet"
                      disabled={busy || !writesEnabled}
                      onClick={() => {
                        setRevokeError(null);
                        setRevoking(share);
                      }}
                    >
                      Turn off link
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {hasMore && (
              <Button
                variant="quiet"
                disabled={loadingMore || busy}
                onClick={() => void loadMore()}
              >
                {loadingMore ? "Loading links…" : "Load more links"}
              </Button>
            )}
          </details>
        )}
      </ShareReviewDialog>
      <ShareRevocationDialog
        open={!!revoking && open && writesEnabled}
        lookTitle={saved?.title ?? "this saved look"}
        busy={busy}
        error={revokeError}
        onClose={() => setRevoking(null)}
        onRevoke={() => void revoke()}
      />
    </>
  );
}
