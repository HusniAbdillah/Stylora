"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button, ConfirmDialog } from "@/components/ui";
import {
  requestOperation,
  retryOperationRequest,
} from "@/features/operations/client";
import { StudioSaveButton } from "@/features/outfits/studio-save-button";
import {
  PreviewStudio,
  type PreviewSelection,
  type PreviewCategory,
  type PreviewJob,
} from "./preview-studio";
import { savePreviewSelection } from "./actions";
import { publishFeedback } from "@/lib/feedback/store";
import { previewSelectionSchema } from "./schema";
import { imageRenderSettingsSchema } from "@/features/ai/image-settings";
import { isCurrentPreviewResponse } from "./request-context";
import type { readPreview } from "./data";

const statusResponse = z.object({
  data: z.object({
    draftId: z.uuid(),
    revision: z.number().int().positive(),
    operationId: z.uuid().nullable(),
    renderRequestId: z.uuid().optional(),
    preferenceRevision: z.number().int().nonnegative(),
    renderFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    imageOutdated: z.boolean(),
    staleNotice: z.string().optional(),
    renderSettings: imageRenderSettingsSchema,
    job: z.object({
      status: z.enum([
        "idle",
        "queued",
        "running",
        "succeeded",
        "failed",
        "unavailable",
        "cancelled",
      ]),
      imageUrl: z.string().nullable().optional(),
      elapsedSeconds: z.number().optional(),
      errorMessage: z.string().optional(),
      superseded: z.boolean().optional(),
    }),
  }),
});

export function PreviewClient({
  initial,
  category,
}: {
  initial: Awaited<ReturnType<typeof readPreview>>;
  category: PreviewCategory;
}) {
  const router = useRouter();
  const draft = useRef({
    draftId: initial.draftId,
    revision: initial.revision,
  });
  const queue = useRef(Promise.resolve());
  const launchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const resumed = useRef("");
  const pendingRender = useRef<string | undefined>(undefined);
  const pendingLaunches = useRef(new Set<string>());
  const seeded = useRef(false);
  const [activeDraftId, setActiveDraftId] = useState(initial.draftId);
  const latestSelection = useRef(initial.selection);
  const persistedSelection = useRef(initial.draftId ? initial.selection : null);
  const activeCategory = useRef(category);
  const [selectedCategory, setSelectedCategory] = useState(category);
  const preferenceRevision = useRef(initial.preferenceRevision);
  const renderFingerprint = useRef(initial.renderFingerprint);
  const refreshPreferences = useRef(false);
  const contextEpoch = useRef(0);
  const refreshVersion = useRef(0);
  const refreshStatus = useRef<() => void>(() => undefined);
  const [imageOutdated, setImageOutdated] = useState(initial.imageOutdated);
  const [staleNotice, setStaleNotice] = useState(initial.staleNotice);
  const [statusFailed, setStatusFailed] = useState(false);
  const openingPreferences = useRef(false);
  const [preferencesPending, setPreferencesPending] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [status, setStatus] = useState(
    initial.draftId ? "Selections saved" : "Choose pieces to start",
  );
  const [job, setJob] = useState<PreviewJob>(initial.job);
  const [operationId, setOperationId] = useState<string | null>(
    initial.operationId,
  );
  const [savedSelection, setSavedSelection] = useState(
    !!initial.draftId && initial.selectionValid,
  );
  const [draftRevision, setDraftRevision] = useState(initial.revision);
  const [selectionCount, setSelectionCount] = useState(
    Object.keys(initial.selection).length,
  );
  const [conflict, setConflict] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const launch = useCallback(
    async function executePreview(
      mode: "resume" | "regenerate" | "retry",
      resumedOperationId?: string | null,
    ): Promise<void> {
      if (
        !draft.current.draftId ||
        !initial.writesEnabled ||
        openingPreferences.current ||
        (mode === "resume" &&
          latestSelection.current !== persistedSelection.current)
      )
        return;
      const launchKey = `${draft.current.draftId}:${draft.current.revision}:${preferenceRevision.current}:${renderFingerprint.current}:${mode}`;
      if (pendingLaunches.current.has(launchKey)) return;
      pendingLaunches.current.add(launchKey);
      setJob((previous) => ({ ...previous, status: "queued" }));
      setImageOutdated(true);
      const current = {
        ...draft.current,
        preferenceRevision: preferenceRevision.current,
        epoch: contextEpoch.current,
        renderFingerprint: renderFingerprint.current,
      };
      const renderSelection = latestSelection.current;
      let superseded = false;
      try {
        const body = {
          draftId: current.draftId,
          expectedRevision: current.revision,
          ...(mode === "regenerate" || (mode === "retry" && !operationId)
            ? { renderRequestId: crypto.randomUUID() }
            : {}),
        };
        pendingRender.current = body.renderRequestId;
        if (body.renderRequestId) setSavedSelection(false);
        const response =
          mode === "retry" && operationId
            ? await retryOperationRequest(operationId, "/api/previews", body)
            : await requestOperation(
                resumedOperationId ??
                  `preview:${current.preferenceRevision}:${current.renderFingerprint}:${JSON.stringify(body)}`,
                "/api/previews",
                body,
              );
        if (!response.ok) {
          const failure = z
            .object({
              error: z.object({
                code: z.string(),
                message: z.string().max(600),
              }),
            })
            .parse(await response.json()).error;
          if (
            latestSelection.current === renderSelection &&
            current.epoch === contextEpoch.current &&
            current.preferenceRevision === preferenceRevision.current
          )
            setJob((previous) => ({
              ...previous,
              status:
                failure.code === "image_unavailable" ||
                failure.code === "WORKFLOW_RPC_UNAVAILABLE"
                  ? "unavailable"
                  : "failed",
              errorMessage: failure.message,
            }));
          return;
        }
        const result = statusResponse.parse(await response.json()).data;
        if (result.renderFingerprint !== renderFingerprint.current) {
          setImageOutdated(true);
          refreshStatus.current();
          return;
        }
        if (
          latestSelection.current !== renderSelection ||
          !isCurrentPreviewResponse(
            {
              ...draft.current,
              preferenceRevision: preferenceRevision.current,
              epoch: contextEpoch.current,
              renderFingerprint: renderFingerprint.current,
            },
            current,
            result,
            pendingRender.current,
          )
        )
          return;
        draft.current = { draftId: result.draftId, revision: result.revision };
        setDraftRevision(result.revision);
        setSavedSelection(true);
        pendingRender.current = undefined;
        setOperationId(result.operationId);
        setJob(result.job);
        if (result.preferenceRevision !== preferenceRevision.current)
          refreshPreferences.current = true;
        preferenceRevision.current = result.preferenceRevision;
        setImageOutdated(result.imageOutdated);
        setStaleNotice(result.staleNotice);
        superseded = result.job.superseded ?? false;
      } catch {
        if (
          draft.current.draftId === current.draftId &&
          latestSelection.current === renderSelection &&
          current.epoch === contextEpoch.current &&
          current.preferenceRevision === preferenceRevision.current &&
          draft.current.revision === current.revision
        )
          setJob((previous) => ({
            ...previous,
            status: "failed",
            errorMessage:
              "The image could not finish. Your selection is kept. Retry image to continue.",
          }));
      } finally {
        pendingLaunches.current.delete(launchKey);
        if (superseded && latestSelection.current === renderSelection)
          void executePreview("resume");
      }
    },
    [operationId, initial.writesEnabled],
  );

  useEffect(() => {
    if (
      resumed.current ===
        `${initial.draftId}:${initial.revision}:${initial.preferenceRevision}:${initial.renderFingerprint}` ||
      !initial.draftId ||
      !initial.writesEnabled ||
      !Object.keys(initial.selection).length ||
      !initial.selectionValid ||
      persistedSelection.current !== latestSelection.current ||
      initial.job.status === "unavailable" ||
      initial.job.status === "succeeded" ||
      initial.job.status === "failed" ||
      initial.job.status === "cancelled"
    )
      return;
    resumed.current = `${initial.draftId}:${initial.revision}:${initial.preferenceRevision}:${initial.renderFingerprint}`;
    void launch("resume", initial.operationId);
  }, [
    initial.draftId,
    initial.revision,
    initial.preferenceRevision,
    initial.renderFingerprint,
    initial.operationId,
    initial.writesEnabled,
    initial.selection,
    initial.job.status,
    initial.selectionValid,
    launch,
  ]);

  useEffect(() => {
    if (!activeDraftId) return;
    let active = true;
    async function refresh() {
      const version = ++refreshVersion.current;
      const selection = latestSelection.current;
      const response = await fetch(`/api/previews?draftId=${activeDraftId}`, {
        cache: "no-store",
      });
      if (!active) return;
      if (!response.ok) throw new Error("PREVIEW_STATUS_UNAVAILABLE");
      const result = statusResponse.parse(await response.json()).data;
      if (
        !active ||
        version !== refreshVersion.current ||
        result.draftId !== draft.current.draftId ||
        selection !== latestSelection.current ||
        result.preferenceRevision < preferenceRevision.current
      )
        return;
      const preferencesChanged =
        result.preferenceRevision !== preferenceRevision.current ||
        result.renderFingerprint !== renderFingerprint.current ||
        refreshPreferences.current;
      if (result.renderFingerprint !== renderFingerprint.current)
        contextEpoch.current += 1;
      renderFingerprint.current = result.renderFingerprint;
      preferenceRevision.current = result.preferenceRevision;
      setStatusFailed(false);
      if (preferencesChanged) setImageOutdated(true);
      if (
        persistedSelection.current === latestSelection.current &&
        (result.revision === draft.current.revision ||
          (pendingRender.current &&
            result.renderRequestId === pendingRender.current))
      ) {
        draft.current = { draftId: result.draftId, revision: result.revision };
        setDraftRevision(result.revision);
        setSavedSelection(true);
        setJob(result.job);
        setOperationId(result.operationId);
        setImageOutdated(result.imageOutdated);
        setStaleNotice(result.staleNotice);
        if (
          preferencesChanged &&
          !pendingRender.current &&
          !openingPreferences.current
        ) {
          refreshPreferences.current = false;
          router.refresh();
        }
        if (
          (result.job.superseded || result.job.status === "queued") &&
          initial.writesEnabled &&
          initial.job.status !== "unavailable" &&
          Object.keys(selection).length
        )
          void launch("resume", result.operationId);
      }
    }
    const check = () => {
      void refresh().catch(() => {
        if (active) setStatusFailed(true);
      });
    };
    refreshStatus.current = check;
    const interval = setInterval(
      () => {
        check();
      },
      job.status === "queued" || job.status === "running" ? 2500 : 240000,
    );
    const focus = () => {
      if (document.visibilityState !== "visible") return;
      contextEpoch.current += 1;
      setImageOutdated(true);
      const next = previewSelectionSchema
        .keyof()
        .safeParse(new URL(window.location.href).searchParams.get("category"));
      if (next.success) {
        activeCategory.current = next.data;
        setSelectedCategory(next.data);
      }
      check();
    };
    const preferencesUpdated = (event: Event) => {
      const detail = z
        .object({ revision: z.number().int().nonnegative() })
        .safeParse("detail" in event ? event.detail : undefined);
      if (detail.success && detail.data.revision <= preferenceRevision.current)
        return;
      contextEpoch.current += 1;
      setImageOutdated(true);
      refreshPreferences.current = true;
      if (detail.success) preferenceRevision.current = detail.data.revision;
      check();
    };
    const restore = () => {
      openingPreferences.current = false;
      setPreferencesPending(false);
      focus();
    };
    const pageShow = (event: PageTransitionEvent) => {
      if (event.persisted) restore();
    };
    check();
    window.addEventListener("focus", focus);
    window.addEventListener("pageshow", pageShow);
    window.addEventListener("popstate", restore);
    window.addEventListener("stylora:preferences-updated", preferencesUpdated);
    document.addEventListener("visibilitychange", focus);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pageshow", pageShow);
      window.removeEventListener("popstate", restore);
      window.removeEventListener(
        "stylora:preferences-updated",
        preferencesUpdated,
      );
      document.removeEventListener("visibilitychange", focus);
    };
  }, [
    activeDraftId,
    job.status,
    savedSelection,
    initial.writesEnabled,
    initial.preferenceRevision,
    initial.job.status,
    router,
    launch,
  ]);

  const persist = useCallback(
    (selection: PreviewSelection) => {
      latestSelection.current = selection;
      pendingRender.current = undefined;
      clearTimeout(launchTimer.current);
      setSavedSelection(false);
      setSelectionCount(Object.keys(selection).length);
      setStatus("Saving selection…");
      setJob((previous) => ({ ...previous, status: "idle" }));
      setImageOutdated(true);
      queue.current = queue.current.then(async () => {
        try {
          const result = await savePreviewSelection({
            ...draft.current,
            selection,
          });
          if (!result.ok) {
            publishFeedback({
              id: "preview-selection",
              label: "Preview selection could not be saved",
              state: "failed",
              detail:
                result.code === "revision_conflict"
                  ? "This preview changed elsewhere. Review the saved selection before continuing."
                  : "Try selecting the piece again.",
            });
            if (result.code === "revision_conflict") setConflict(true);
            setStatus(
              result.code === "revision_conflict"
                ? "This preview changed elsewhere. Reload to review the current selection."
                : "Selection could not be saved. Try selecting the piece again.",
            );
            setSaveFailed(true);
            return;
          }
          draft.current = {
            draftId: result.draftId,
            revision: result.revision,
          };
          setDraftRevision(result.revision);
          setActiveDraftId(result.draftId);
          persistedSelection.current = selection;
          setSaveFailed(false);
          const url = new URL(window.location.href);
          url.searchParams.set("draftId", result.draftId);
          url.searchParams.delete("capsuleId");
          url.searchParams.delete("outfitId");
          url.searchParams.delete("savedLookId");
          window.history.replaceState(null, "", url);
          if (selection === latestSelection.current) setSavedSelection(true);
          setStatus("Selections saved");
          publishFeedback({
            id: "preview-selection",
            label: "Preview selection",
            state: "complete",
            detail: "Selections saved.",
            toast: false,
          });
          if (
            selection === latestSelection.current &&
            !openingPreferences.current &&
            Object.keys(selection).length &&
            initial.job.status !== "unavailable"
          )
            launchTimer.current = setTimeout(() => {
              void launch("resume");
            }, 600);
        } catch {
          setSaveFailed(true);
          setStatus(
            "Selection could not be saved. Try selecting the piece again.",
          );
          publishFeedback({
            id: "preview-selection",
            label: "Preview selection could not be saved",
            state: "failed",
            detail: "Check your connection and try selecting the piece again.",
          });
        }
      });
    },
    [launch, initial.job.status],
  );

  async function editPreferences() {
    if (openingPreferences.current) return;
    openingPreferences.current = true;
    setPreferencesPending(true);
    clearTimeout(launchTimer.current);
    await queue.current;
    if (
      initial.writesEnabled &&
      latestSelection.current !== persistedSelection.current &&
      (draft.current.draftId || Object.keys(latestSelection.current).length)
    ) {
      openingPreferences.current = false;
      setPreferencesPending(false);
      setSaveFailed(true);
      setStatus(
        "Save your selection before editing preferences. Retry save to continue.",
      );
      return;
    }
    const params = new URLSearchParams({ category: activeCategory.current });
    if (draft.current.draftId) params.set("draftId", draft.current.draftId);
    router.push(
      `/preferences?returnTo=${encodeURIComponent(`/preview?${params}`)}`,
    );
  }

  useEffect(() => {
    if (
      !initial.seed ||
      seeded.current ||
      !initial.writesEnabled ||
      !Object.keys(initial.selection).length
    )
      return;
    seeded.current = true;
    persist(initial.selection);
  }, [initial.seed, initial.writesEnabled, initial.selection, persist]);

  return (
    <>
      <p role="status" className="mb-4 text-xs text-secondary">
        {initial.writesEnabled
          ? status
          : "Workspace changes are currently disabled."}
      </p>
      {statusFailed && (
        <div role="alert" className="mb-4 rounded-xl bg-blush p-4 text-sm">
          <p>
            Preview status could not be checked. Retry to check the latest image
            and preferences.
          </p>
          <Button variant="quiet" onClick={() => refreshStatus.current()}>
            Retry status
          </Button>
        </div>
      )}
      {saveFailed && !conflict && (
        <Button
          variant="quiet"
          disabled={preferencesPending}
          onClick={() => persist(latestSelection.current)}
        >
          Retry save
        </Button>
      )}
      {conflict && (
        <Button variant="quiet" onClick={() => setReviewing(true)}>
          Review saved selection
        </Button>
      )}
      <ConfirmDialog
        open={reviewing}
        onClose={() => setReviewing(false)}
        title="Replace local preview choices?"
        description="Load the latest shared selection and discard your unsaved choices in this preview."
        confirmLabel="Load saved selection"
        onConfirm={() => {
          setReviewing(false);
          router.refresh();
        }}
      />
      {!initial.items.length && (
        <p className="mb-4 rounded-xl bg-blush p-4 text-sm">
          Add owned pieces to your{" "}
          <Link href="/wardrobe" className="underline">
            wardrobe
          </Link>{" "}
          to create a preview.
        </p>
      )}
      {initial.seedNotice && (
        <div className="mb-4 rounded-xl bg-blush p-4 text-sm">
          <p>{initial.seedNotice}</p>
          {initial.proposedNames.length > 0 && (
            <p className="mt-2">
              {initial.extraPiecesLabel} · {initial.proposedNames.join(", ")}
            </p>
          )}
        </div>
      )}
      {staleNotice && (
        <p role="status" className="mb-4 rounded-xl bg-blush p-4 text-sm">
          {staleNotice}
        </p>
      )}
      <PreviewStudio
        items={initial.items}
        initialSelection={initial.selection}
        profileSummary={initial.profileSummary}
        job={job}
        imageOutdated={imageOutdated}
        category={selectedCategory}
        readOnly={!initial.writesEnabled || preferencesPending}
        initialCategory={category}
        primarySave={
          activeDraftId ? (
            <StudioSaveButton
              key={`${activeDraftId}:${draftRevision}`}
              source={{ kind: "preview", id: activeDraftId }}
              expectedRevision={draftRevision}
              title="Your preview outfit"
              disabled={
                !selectionCount || !savedSelection || !initial.writesEnabled
              }
            />
          ) : undefined
        }
        onCategoryChange={(next) => {
          activeCategory.current = next;
          setSelectedCategory(next);
          const url = new URL(window.location.href);
          url.searchParams.set("category", next);
          window.history.replaceState(null, "", url);
        }}
        onSelectionChange={initial.writesEnabled ? persist : undefined}
        onGenerate={
          savedSelection
            ? () => {
                void launch(
                  job.status === "failed"
                    ? "retry"
                    : (job.status === "succeeded" && !imageOutdated) ||
                        job.status === "cancelled"
                      ? "regenerate"
                      : "resume",
                );
              }
            : undefined
        }
        onEditPreferences={() => {
          void editPreferences();
        }}
      />
    </>
  );
}
