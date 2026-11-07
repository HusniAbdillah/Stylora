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
}: Props) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<SavedLook | null>(null);
  const [shares, setShares] = useState<ShareMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<string[]>([]);
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
    setSelectedMedia([]);
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
    if (mutation.current || !writesEnabled || !saved) return;
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
            approvedMediaIds: selectedMedia,
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
        avatarUrl:
          readyMediaId && selectedMedia.includes(readyMediaId)
            ? saved.media.imageUrl
            : null,
        avatarNotice: readyMediaId
          ? "Select the completed avatar to include it."
          : "No completed avatar is included. The saved items can still be shared.",
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
        {saved && (
          <fieldset
            className="mt-4"
            disabled={busy || !!published || !writesEnabled}
          >
            <legend className="text-sm font-medium">
              Avatar for this link
            </legend>
            {readyMediaId ? (
              <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-stone p-3 text-sm">
                <input
                  type="checkbox"
                  checked={selectedMedia.includes(readyMediaId)}
                  onChange={(event) =>
                    setSelectedMedia(event.target.checked ? [readyMediaId] : [])
                  }
                  className="size-4 accent-crimson"
                />
                Include the completed avatar shown in the preview
              </label>
            ) : (
              <>
                <p className="mt-2 text-xs leading-relaxed text-secondary">
                  No completed avatar is available to approve. You can share the
                  saved items without one.
                </p>
                <Button
                  variant="quiet"
                  disabled={busy || !!published}
                  onClick={() => void load()}
                >
                  Refresh image status
                </Button>
              </>
            )}
          </fieldset>
        )}
        {saved && (
          <section className="mt-5" aria-label="Existing share links">
            <h3 className="text-sm font-medium">Existing links</h3>
            <p className="mt-1 text-xs leading-relaxed text-secondary">
              Full links are shown only when created. To copy a new link, review
              this look and create another.
            </p>
            {!shares.length && (
              <p className="mt-3 text-sm text-secondary">
                No links have been created for this look.
              </p>
            )}
            <ul className="mt-3 space-y-2">
              {shares.map((share) => (
                <li
                  key={share.id}
                  className="rounded-xl border border-stone p-3"
                >
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
                        : "Active until you turn it off"}
                  </p>
                  {share.catchphrase && (
                    <p className="mt-1 break-words text-xs text-secondary">
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
          </section>
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
