"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { BrowserApiError, requestData } from "@/lib/browser-api";
import { ShareManager } from "@/features/sharing/share-manager";
import { SavedLookDetail, SavedLooksGallery } from "./saved-looks";
import {
  savedCollectionHref,
  toSavedLookView,
  type SavedFilter,
  type SavedLookResponse,
  type SavedLooksResponse,
} from "./saved-view-model";
import { useSavedMediaRefresh } from "./use-media-refresh";

function errorMessage(error: unknown) {
  return error instanceof BrowserApiError
    ? error.message
    : "The saved look could not be updated. Try again.";
}

function WritesNotice({ enabled }: { enabled: boolean }) {
  return enabled ? null : (
    <p
      role="status"
      className="mb-5 rounded-xl border border-stone bg-paper p-4 text-sm text-secondary"
    >
      Changes are turned off for this shared workspace. You can still browse
      saved looks.
    </p>
  );
}

export function SavedCollectionWorkspace({
  initial,
  filter,
  limit,
  cursor,
  writesEnabled,
}: {
  initial: SavedLooksResponse;
  filter: SavedFilter;
  limit: number;
  cursor?: string;
  writesEnabled: boolean;
}) {
  const router = useRouter();
  const [changing, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const pending = initial.items.some(
    (look) => look.media.status === "queued" || look.media.status === "running",
  );
  const polling = useSavedMediaRefresh(pending, changing || busyId !== null);
  const href = savedCollectionHref(filter, limit, cursor);
  async function retryImage(id: string) {
    if (!writesEnabled || busyId) return;
    setBusyId(id);
    setFailure(null);
    setMessage(null);
    try {
      await requestData(`/api/saved-looks/${id}/media/retry`, {
        method: "POST",
      });
      setMessage("Image retry requested. Your saved outfit is unchanged.");
      polling.refresh();
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }
  return (
    <>
      <WritesNotice enabled={writesEnabled} />
      {failure && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-missing-bg p-4 text-sm text-missing"
        >
          {failure}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="mb-4 rounded-xl bg-owned-bg p-4 text-sm text-owned"
        >
          {message}
        </p>
      )}
      <SavedLooksGallery
        looks={initial.items.map(toSavedLookView)}
        filter={filter}
        counts={initial.counts}
        busyId={busyId}
        changingView={changing}
        getLookHref={(id) =>
          `/saved-looks/${id}?returnTo=${encodeURIComponent(href)}`
        }
        onFilterChange={(next) =>
          startTransition(() => router.push(savedCollectionHref(next, limit)))
        }
        onRetryImage={writesEnabled ? (id) => void retryImage(id) : undefined}
        renderShare={(look) =>
          look.share?.active || writesEnabled ? (
            <ShareManager
              savedLookId={look.id}
              writesEnabled={writesEnabled}
              label={look.share?.active ? "Manage" : "Share"}
              onChanged={() => router.refresh()}
            />
          ) : (
            <Button variant="quiet" disabled>
              Share
            </Button>
          )
        }
      />
      {polling.stopped && (
        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-secondary">
          <p>
            Your image is still preparing. Check its status again when you are
            ready.
          </p>
          <Button variant="secondary" onClick={polling.refresh}>
            Refresh status
          </Button>
        </div>
      )}
      <nav
        aria-label="Saved look pages"
        className="mt-8 flex flex-wrap items-center justify-between gap-3 pb-8"
      >
        {cursor ? (
          <Button asChild variant="quiet">
            <Link href={savedCollectionHref(filter, limit)}>
              Back to first page
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {initial.nextCursor && (
          <Button asChild variant="secondary">
            <Link href={savedCollectionHref(filter, limit, initial.nextCursor)}>
              Next looks
            </Link>
          </Button>
        )}
      </nav>
    </>
  );
}

export function SavedDetailWorkspace({
  initial,
  writesEnabled,
  backHref,
}: {
  initial: SavedLookResponse;
  writesEnabled: boolean;
  backHref: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const look = toSavedLookView(initial);
  const polling = useSavedMediaRefresh(
    look.mediaStatus === "queued" || look.mediaStatus === "running",
    busy,
  );
  async function retryImage() {
    if (
      !writesEnabled ||
      busy ||
      !initial.media.canRetry ||
      initial.media.status !== "failed"
    )
      return;
    setBusy(true);
    setFailure(null);
    setMessage(null);
    try {
      await requestData(`/api/saved-looks/${initial.id}/media/retry`, {
        method: "POST",
      });
      setMessage("Image retry requested. Your saved outfit is unchanged.");
      polling.refresh();
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function removeLook() {
    if (!writesEnabled || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await requestData(`/api/saved-looks/${initial.id}`, { method: "DELETE" });
      router.push(backHref);
      router.refresh();
    } catch (error) {
      setFailure(errorMessage(error));
      throw error;
    } finally {
      setBusy(false);
    }
  }
  const share = (label: string) =>
    label === "Manage" || writesEnabled ? (
      <ShareManager
        savedLookId={initial.id}
        writesEnabled={writesEnabled}
        label={label}
        onChanged={() => router.refresh()}
      />
    ) : (
      <Button disabled variant={label === "Share" ? "primary" : "quiet"}>
        {label}
      </Button>
    );
  return (
    <>
      <WritesNotice enabled={writesEnabled} />
      {failure && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-missing-bg p-4 text-sm text-missing"
        >
          {failure}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="mb-4 rounded-xl bg-owned-bg p-4 text-sm text-owned"
        >
          {message}
        </p>
      )}
      <SavedLookDetail
        look={look}
        busy={busy}
        writesEnabled={writesEnabled}
        onRetryImage={writesEnabled ? () => void retryImage() : undefined}
        onDelete={removeLook}
        onPreview={(id) => router.push(`/preview?savedLookId=${id}`)}
        shareAction={share("Share")}
        manageShareAction={share("Manage")}
        onRefresh={polling.refresh}
      />
      {polling.stopped && (
        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-secondary">
          <p>
            Your image is still preparing. Check its status again when you are
            ready.
          </p>
          <Button variant="secondary" onClick={polling.refresh}>
            Refresh status
          </Button>
        </div>
      )}
      <p className="mt-5 text-sm text-secondary">
        Capsule actions are unavailable for this saved look.
      </p>
      <Link
        href={backHref}
        className="mt-6 inline-flex min-h-11 items-center text-sm text-crimson hover:underline"
      >
        Back to saved looks
      </Link>
    </>
  );
}
