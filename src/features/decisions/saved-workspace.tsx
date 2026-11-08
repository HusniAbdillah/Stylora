"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { BrowserApiError, requestData } from "@/lib/browser-api";
import { ShareManager } from "@/features/sharing/share-manager";
import { startOperationRequest } from "@/features/operations/client";
import { mediaCommandSchema, pendingSavedAvatarOperations } from "./media";
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
  const pending = pendingSavedAvatarOperations(initial.items);
  const polling = useSavedMediaRefresh(
    pending.length > 0,
    changing || busyId !== null,
    writesEnabled ? pending : null,
  );
  const href = savedCollectionHref(filter, limit, cursor);
  async function retryImage(id: string) {
    if (!writesEnabled || busyId) return;
    setBusyId(id);
    setFailure(null);
    setMessage(null);
    try {
      const result = mediaCommandSchema.parse(
        await requestData(`/api/saved-looks/${id}/media/retry`, {
          method: "POST",
        }),
      );
      setMessage("Retrying the saved image.");
      polling.refresh();
      await startOperationRequest(
        result.media.operationId,
        `/api/avatars/${result.media.operationId}`,
      );
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setBusyId(null);
      polling.refresh();
    }
  }
  return (
    <>
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
              mode={look.share?.active ? "manage" : "create"}
              onChanged={() => router.refresh()}
            />
          ) : (
            <span className="flex items-center gap-2">
              <Button variant="quiet" disabled>
                Share
              </Button>
              <span className="text-xs text-secondary">Read-only</span>
            </span>
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
  const regeneration = useRef<{
    expectedMediaId: string;
    idempotencyKey: string;
  } | null>(null);
  const look = toSavedLookView(initial);
  const polling = useSavedMediaRefresh(
    look.mediaStatus === "queued" || look.mediaStatus === "running",
    busy,
    writesEnabled ? initial.media.operationId : null,
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
      const result = mediaCommandSchema.parse(
        await requestData(`/api/saved-looks/${initial.id}/media/retry`, {
          method: "POST",
        }),
      );
      setMessage("Retrying the saved image.");
      polling.refresh();
      await startOperationRequest(
        result.media.operationId,
        `/api/avatars/${result.media.operationId}`,
      );
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setBusy(false);
      polling.refresh();
    }
  }
  async function regenerateImage() {
    if (
      !writesEnabled ||
      busy ||
      !initial.media.id ||
      ["queued", "running"].includes(initial.media.status)
    )
      return;
    if (
      !regeneration.current ||
      regeneration.current.expectedMediaId !== initial.media.id
    )
      regeneration.current = {
        expectedMediaId: initial.media.id,
        idempotencyKey: crypto.randomUUID(),
      };
    setBusy(true);
    setFailure(null);
    setMessage(null);
    try {
      const result = mediaCommandSchema.parse(
        await requestData(`/api/saved-looks/${initial.id}/media/regenerate`, {
          method: "POST",
          body: JSON.stringify(regeneration.current),
        }),
      );
      setMessage(
        look.avatarUrl
          ? "Preparing a new image. The previous image stays visible."
          : "Preparing a new image.",
      );
      polling.refresh();
      await startOperationRequest(
        result.media.operationId,
        `/api/avatars/${result.media.operationId}`,
      );
    } catch (error) {
      setFailure(errorMessage(error));
      if (
        error instanceof BrowserApiError &&
        error.status >= 400 &&
        error.status < 500
      )
        regeneration.current = null;
    } finally {
      setBusy(false);
      polling.refresh();
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
        mode={label === "Manage" ? "manage" : "create"}
        onChanged={() => router.refresh()}
      />
    ) : (
      <Button disabled variant={label === "Share" ? "primary" : "quiet"}>
        {label}
      </Button>
    );
  return (
    <>
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
        onRegenerateImage={
          writesEnabled ? () => void regenerateImage() : undefined
        }
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
      <Link
        href={backHref}
        className="mt-6 inline-flex min-h-11 items-center text-sm text-crimson hover:underline"
      >
        Back to saved looks
      </Link>
    </>
  );
}
