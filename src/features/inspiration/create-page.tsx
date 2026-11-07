"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, ConfirmDialog, Icon, Stepper } from "@/components/ui";
import {
  InspirationUpload,
  ReviewPieces,
  PieceEditor,
  type DetectedPiece,
  type PieceEditValues,
} from "./components";
import { WardrobeMatchView } from "@/features/matching/components";
import {
  OutfitIdeas,
  type OutfitIdea,
} from "@/features/outfits/components/outfit-ideas";
import { useCreateWorkspace } from "./create-workspace";
import { canonicalEdit, useCreateSession } from "./create-session";
import {
  stepKeys,
  type CreateOperation,
  type CreateStep,
} from "./client-contract";
import {
  label,
  presentConfidence,
  presentIdeas,
  presentMatches,
  presentPiece,
  presentPreferences,
} from "./presentation";
import { CreateLoading } from "./create-loading";

const isActive = (operation: CreateOperation | undefined) =>
  Boolean(
    operation && ["queued", "running", "partial"].includes(operation.status),
  );
const operationStatus = (
  operation: CreateOperation | undefined,
  ready = false,
) =>
  ready
    ? ("ready" as const)
    : operation?.status === "failed"
      ? ("failed" as const)
      : isActive(operation)
        ? operation?.status === "queued"
          ? ("queued" as const)
          : ("running" as const)
        : ("queued" as const);

export function CreatePage({
  draftId,
  lookId,
  optionId,
  step = "upload",
}: {
  draftId?: string;
  lookId?: string;
  optionId?: string;
  step?: CreateStep;
}) {
  const { scopeKey, writesEnabled } = useCreateWorkspace();
  const { session, state } = useCreateSession(scopeKey);
  const router = useRouter();
  const [editor, setEditor] = useState<DetectedPiece | null | undefined>(
    undefined,
  );
  const [confirmation, setConfirmation] = useState<
    "discard" | "replace" | "editor" | null
  >(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [removePiece, setRemovePiece] = useState<DetectedPiece | null>(null);
  const [busy, setBusy] = useState(false);
  const editorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHandoff = useRef("");
  const restoredOption = useRef("");
  useEffect(
    () => () => {
      if (editorTimer.current) clearTimeout(editorTimer.current);
    },
    [session, draftId, lookId],
  );
  const look = state.look;
  const description = session.currentOperation("inspiration_description");
  const confidence = session.currentOperation("inspiration_confidence");
  const matching = session.currentOperation("wardrobe_match");
  const options = session.currentOperation("outfit_options");
  const completeDescription =
    Boolean(look?.pieces.length) && !isActive(description);
  const matchesReady =
    Boolean(look?.pieces.length) &&
    look!.matches.filter((match) => !match.stale).length ===
      look!.pieces.length;
  const ideasReady =
    look?.outfitOptions.filter((option) => !option.stale).length === 3;
  useEffect(() => {
    if (!look || !optionId) return;
    const identity = `${look.id}:${optionId}`;
    if (restoredOption.current === identity) return;
    restoredOption.current = identity;
    const option = look.outfitOptions.find(
      (option) => option.id === optionId && !option.stale,
    );
    if (option) session.selectDirection(option.optionType);
  }, [look, optionId, session]);
  useEffect(() => {
    if (!look || !ideasReady) return;
    const options = look.outfitOptions.filter((option) => !option.stale);
    const identity = options
      .map((option) => `${option.id}:${option.revision}`)
      .join(":");
    if (lastHandoff.current === identity) return;
    lastHandoff.current = identity;
    for (const option of options.filter((option) => option.status === "ready"))
      router.prefetch(`/looks/${look.id}?option_id=${option.id}`);
    window.dispatchEvent(
      new CustomEvent("stylora:outfit-options-committed", {
        detail: {
          lookId: look.id,
          revision: look.revision,
          options: options.map((option) => ({
            optionId: option.id,
            optionType: option.optionType,
            revision: option.revision,
            slots: option.items.map((item) => ({
              id: item.id,
              slotId: item.slotId,
              revision: item.revision,
              missingBrief: item.missingBrief,
            })),
          })),
        },
      }),
    );
  }, [look, ideasReady, router]);
  const retryInit = () => {
    void session
      .hydrate(draftId, lookId)
      .catch((error) => session.report(error));
  };

  useEffect(() => {
    session.writesEnabled = writesEnabled;
    void session.hydrate(draftId, lookId).then(() => session.refresh());
  }, [session, draftId, lookId, writesEnabled]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void session.refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("stylora:preferences-updated", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("stylora:preferences-updated", refresh);
    };
  }, [session]);
  useEffect(() => {
    if (
      !writesEnabled ||
      !look ||
      !state.draft ||
      !state.preferenceFingerprint ||
      state.contextSaving ||
      look.sourceType === "sample"
    )
      return;
    if (!look.pieces.length && !description)
      void session.start("inspiration_description");
    if (
      (!look.confidenceReview || look.confidenceReview.stale) &&
      (!confidence ||
        confidence.status === "succeeded" ||
        confidence.status === "superseded")
    )
      void session.start("inspiration_confidence");
    if (
      editor !== undefined ||
      state.hasEditorDraft ||
      state.draft.payload.pieceDraft
    )
      return;
    if (
      step !== "upload" &&
      completeDescription &&
      !matchesReady &&
      (!matching ||
        matching.status === "succeeded" ||
        matching.status === "superseded")
    )
      void session.start("wardrobe_match");
    if (
      step !== "upload" &&
      matchesReady &&
      !ideasReady &&
      (!options ||
        options.status === "succeeded" ||
        options.status === "superseded")
    )
      void session.start("outfit_options");
  }, [
    session,
    writesEnabled,
    look,
    state.draft,
    state.preferenceFingerprint,
    state.contextSaving,
    state.hasEditorDraft,
    step,
    description,
    confidence,
    completeDescription,
    matchesReady,
    ideasReady,
    matching,
    options,
    editor,
  ]);

  const href = (target: CreateStep) =>
    target === "upload"
      ? state.draft
        ? `/create?draft=${state.draft.id}`
        : look
          ? `/create/${look.id}?step=upload`
          : "/create"
      : `/create/${look?.id ?? lookId}?step=${target}${state.draft ? `&draft=${state.draft.id}` : ""}`;
  const currentHref = href(step);
  const hasEditorDraft = state.hasEditorDraft;
  const preferencesHref = `/preferences?returnTo=${encodeURIComponent(currentHref)}`;
  function go(target: CreateStep) {
    if (target === "details") {
      const idea = look
        ? presentIdeas(look, state.operations).find(
            (idea) => idea.direction === state.selectedDirection,
          )
        : undefined;
      if (idea && idea.status !== "unavailable") viewDetails(idea);
      return;
    }
    router.push(href(target));
    void session.visit(target).catch((error) => session.report(error));
  }
  function viewDetails(idea: OutfitIdea) {
    if (!look || idea.status === "unavailable") return;
    session.selectDirection(idea.direction);
    void session.visit("details").catch((error) => session.report(error));
    router.push(
      `/looks/${look.id}?option_id=${idea.id}${state.draft ? `&draft=${state.draft.id}` : ""}`,
    );
  }
  async function choose(file: File) {
    if (!writesEnabled) {
      session.report(new Error("Changes are disabled for this workspace."));
      return;
    }
    if (state.uploadStatus === "uploading") return;
    if (look) {
      setPendingFile(file);
      setConfirmation("replace");
      return;
    }
    await upload(file);
  }
  async function upload(file: File) {
    setBusy(true);
    try {
      await session.upload(file);
      router.replace(`/create?draft=${session.state.draft?.id}`);
    } catch {
      /* The controller retains the upload and safe error. */
    } finally {
      setBusy(false);
    }
  }
  function retryTask(kind: string) {
    const operation = session.currentOperation(kind);
    if (operation?.status === "failed") void session.retry(operation);
    else void session.start(kind, true);
  }
  async function saveEditor(values: PieceEditValues) {
    if (editorTimer.current) clearTimeout(editorTimer.current);
    const current = state.look;
    if (!current) throw new Error("The inspiration is unavailable.");
    const source = editor
      ? current.pieces.find((piece) => piece.id === editor.id)
      : undefined;
    const edited = canonicalEdit(source, values);
    try {
      await session.savePieces(
        source
          ? current.pieces.map((piece) =>
              piece.id === source.id ? edited : piece,
            )
          : [...current.pieces, edited],
      );
    } catch (error) {
      session.report(error);
      throw error;
    }
  }
  function draftEditor(values: PieceEditValues) {
    if (editorTimer.current) clearTimeout(editorTimer.current);
    // Local recovery is immediate; the server mirror is serialized and debounced.
    session.retainEditor(editor?.id ?? null, values);
    editorTimer.current = setTimeout(() => {
      void session
        .saveEditor(editor?.id ?? null, values)
        .catch((error) => session.report(error));
    }, 600);
  }
  const visited =
    state.draft?.visitedSteps ??
    (look
      ? stepKeys.slice(
          0,
          look.status === "options_ready"
            ? 4
            : look.status === "matched"
              ? 3
              : look.pieces.length
                ? 2
                : 2,
        )
      : ["upload"]);
  const stepIndex = stepKeys.indexOf(step);
  const displayedPieces = look?.pieces.length
    ? look.pieces.map(presentPiece)
    : state.provisional.map(presentPiece);
  let confidenceView = presentConfidence(look, confidence);
  if (state.provisionalConfidence && isActive(confidence))
    confidenceView = {
      status: "running",
      insights: state.provisionalConfidence.insights,
      occasions: state.provisionalConfidence.occasions,
      uncertainty: "Provisional review; final validation is still running.",
    };
  const tasks = [
    {
      label: "Piece descriptions",
      status: operationStatus(description, completeDescription),
      detail: completeDescription
        ? `${look?.pieces.length} pieces ready`
        : state.provisional.length
          ? `${state.provisional.length} provisional pieces`
          : description
            ? label(description.status)
            : "Starts after verification",
    },
    {
      label: "Review with confidence",
      status: operationStatus(
        confidence,
        Boolean(look?.confidenceReview && !look.confidenceReview.stale),
      ),
      detail:
        look?.confidenceReview && !look.confidenceReview.stale
          ? "Ready"
          : confidence
            ? label(confidence.status)
            : "Starts independently",
    },
  ];

  if (
    !state.ready ||
    (lookId && look && look.id !== lookId) ||
    (draftId && state.draft && state.draft.id !== draftId)
  )
    return <CreateLoading step={step} />;
  if (step !== "upload" && !look)
    return (
      <section className="py-8">
        <h1 className="font-serif text-4xl">Inspiration unavailable</h1>
        <p className="mt-4 text-secondary">
          {state.error ?? "Upload an inspiration image to begin."}
        </p>
        <div className="mt-5 flex gap-3">
          <Button onClick={retryInit}>Retry</Button>
          <Button asChild variant="secondary">
            <Link href="/create">Go to Upload</Link>
          </Button>
        </div>
      </section>
    );

  return (
    <div className="pt-5 pb-8 md:pt-6">
      <Stepper
        current={stepIndex}
        visited={visited
          .filter((key) => key !== "details" || ideasReady)
          .map((key) => stepKeys.indexOf(key))}
        onSelect={(index) => go(stepKeys[index])}
      />
      {!writesEnabled && (
        <p className="mt-4 rounded-xl border border-stone bg-paper px-4 py-3 text-sm text-secondary">
          This workspace is read-only. Existing results remain available.
        </p>
      )}
      {state.error && (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-rose-wash bg-paper p-4"
        >
          <Icon name="info" className="text-crimson" />
          <p className="min-w-0 flex-1 text-sm">{state.error}</p>
          <Button variant="secondary" onClick={() => void session.refresh()}>
            Reload current data
          </Button>
          <Button variant="quiet" onClick={() => session.clearError()}>
            Dismiss
          </Button>
        </div>
      )}
      {hasEditorDraft && step !== "upload" && editor === undefined && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-blush p-4 text-sm">
          <p className="min-w-0 flex-1">
            An unapplied piece edit is retained. Apply or discard it before
            preparing new matches.
          </p>
          <Button
            variant="secondary"
            disabled={!writesEnabled}
            onClick={() =>
              setEditor(
                displayedPieces.find(
                  (piece) => piece.id === session.editorPieceId(),
                ) ?? null,
              )
            }
          >
            Resume edit
          </Button>
          <Button
            variant="quiet"
            disabled={!writesEnabled}
            onClick={() => setConfirmation("editor")}
          >
            Discard edit
          </Button>
        </div>
      )}
      {step === "upload" && (
        <InspirationUpload
          imageUrl={state.previewUrl}
          fileName={state.file?.name}
          fileSizeLabel={
            state.file
              ? `${(state.file.size / 1024 / 1024).toFixed(1)} MiB`
              : null
          }
          status={state.uploadStatus}
          readOnly={!writesEnabled}
          errorMessage={state.error}
          occasion={
            look ? look.occasion : (state.draft?.payload.occasion ?? null)
          }
          preferences={presentPreferences(state.preferences)}
          tasks={tasks}
          analyzeDisabled={busy || !look}
          onChooseFile={(file) => void choose(file)}
          onRemove={
            writesEnabled ? () => setConfirmation("discard") : undefined
          }
          onOccasionChange={
            writesEnabled && !busy
              ? (occasion) => {
                  void session
                    .setOccasion(occasion)
                    .catch((error) => session.report(error));
                }
              : undefined
          }
          onPreferences={() => router.push(preferencesHref)}
          onAnalyze={() => go("review")}
          onRetry={() => {
            if (state.file) void upload(state.file);
            else retryInit();
          }}
        />
      )}
      {step === "review" && look && (
        <ReviewPieces
          imageUrl={look.inspirationImage?.url ?? ""}
          pieces={displayedPieces}
          descriptionStatus={
            completeDescription
              ? "ready"
              : description?.status === "failed"
                ? "failed"
                : description && isActive(description)
                  ? "running"
                  : "unavailable"
          }
          confidence={confidenceView}
          matchStatus={operationStatus(matching, matchesReady)}
          onBack={() => go("upload")}
          onMatch={
            hasEditorDraft || (!writesEnabled && !matchesReady)
              ? undefined
              : () => {
                  if (!matching && !matchesReady)
                    void session.start("wardrobe_match");
                  go("matches");
                }
          }
          onAddPiece={
            writesEnabled && !isActive(description)
              ? () => setEditor(null)
              : undefined
          }
          onEditPiece={
            writesEnabled && completeDescription ? setEditor : undefined
          }
          onRemovePiece={
            writesEnabled && completeDescription
              ? (piece) => setRemovePiece(piece)
              : undefined
          }
          onRetryDescription={
            writesEnabled
              ? () => retryTask("inspiration_description")
              : undefined
          }
          onRetryConfidence={
            writesEnabled
              ? () => retryTask("inspiration_confidence")
              : undefined
          }
        />
      )}
      {step === "matches" && look && (
        <>
          <p className="mt-5 text-xs text-secondary">
            Sample inventory · Matches use example wardrobe pieces
          </p>
          <WardrobeMatchView
            matches={presentMatches(look)}
            status={
              matchesReady
                ? "ready"
                : matching?.status === "failed"
                  ? "error"
                  : isActive(matching)
                    ? "loading"
                    : "unavailable"
            }
            ideasStatus={operationStatus(options, ideasReady)}
            onBack={() => go("review")}
            onGenerateIdeas={
              writesEnabled || ideasReady
                ? () => {
                    if (!options && !ideasReady)
                      void session.start("outfit_options");
                    go("ideas");
                  }
                : undefined
            }
            onRetry={
              writesEnabled ? () => retryTask("wardrobe_match") : undefined
            }
          />
        </>
      )}
      {step === "ideas" && look && (
        <>
          <p className="mt-5 text-xs text-secondary">
            Sample inventory · Matches use example wardrobe pieces
          </p>
          <OutfitIdeas
            ideas={presentIdeas(look, state.operations)}
            status={
              ideasReady
                ? "ready"
                : options?.status === "failed"
                  ? "error"
                  : isActive(options)
                    ? "loading"
                    : "unavailable"
            }
            selectedDirection={state.selectedDirection}
            onViewDetails={viewDetails}
            onSelectDirection={(direction) =>
              session.selectDirection(direction)
            }
            hasPreferences={Object.values(state.preferences).some((value) =>
              Array.isArray(value) ? value.length : Boolean(value),
            )}
            preferencesUsed={[
              ...new Set(
                look.outfitOptions
                  .filter((option) => !option.stale)
                  .flatMap((option) => option.explanation.inputsUsed)
                  .filter(
                    (key) =>
                      key !== "inspiration" &&
                      key !== "wardrobe" &&
                      key !== "occasion",
                  ),
              ),
            ].map(label)}
            onBack={() => go("matches")}
            onSuggestAnother={
              writesEnabled
                ? (idea) => void session.regenerate(idea.direction)
                : undefined
            }
            onCancelRegeneration={
              writesEnabled
                ? (idea) => {
                    const op = state.operations.find(
                      (operation) =>
                        operation.kind === "option_regeneration" &&
                        operation.optionType === idea.direction &&
                        isActive(operation),
                    );
                    if (op) void session.cancel(op);
                  }
                : undefined
            }
            onSetPreferences={() => router.push(preferencesHref)}
            onRetry={
              writesEnabled ? () => retryTask("outfit_options") : undefined
            }
          />
        </>
      )}
      <PieceEditor
        open={editor !== undefined}
        piece={editor}
        pieceNumber={
          editor
            ? displayedPieces.findIndex((piece) => piece.id === editor.id) + 1
            : undefined
        }
        initialValues={session.getEditor(editor?.id ?? null) ?? undefined}
        onDraftChange={draftEditor}
        onDiscardDraft={() => {
          if (editorTimer.current) clearTimeout(editorTimer.current);
          void session.discardEditor().catch((error) => session.report(error));
        }}
        onClose={() => setEditor(undefined)}
        onSave={saveEditor}
        onRemove={async (piece) => {
          if (!state.look) return;
          await session.savePieces(
            state.look.pieces.filter((item) => item.id !== piece.id),
          );
        }}
      />
      <ConfirmDialog
        open={confirmation !== null}
        onClose={() => {
          if (!busy) setConfirmation(null);
        }}
        title={
          confirmation === "replace"
            ? "Replace this inspiration?"
            : confirmation === "editor"
              ? "Discard this piece edit?"
              : "Discard this inspiration draft?"
        }
        description={
          confirmation === "replace"
            ? "The new image starts fresh analysis. Current matches and ideas will no longer describe the active inspiration."
            : confirmation === "editor"
              ? "Your unapplied changes will be cleared. The saved garment description stays in place."
              : "This clears the active draft and pending upload. Saved looks remain available."
        }
        confirmLabel={
          confirmation === "replace"
            ? "Replace inspiration"
            : confirmation === "editor"
              ? "Discard edit"
              : "Discard draft"
        }
        busy={busy}
        onConfirm={() => {
          const action = confirmation;
          setConfirmation(null);
          if (action === "replace" && pendingFile) {
            void upload(pendingFile);
            setPendingFile(null);
          } else if (action === "editor") {
            if (editorTimer.current) clearTimeout(editorTimer.current);
            void session
              .discardEditor()
              .catch((error) => session.report(error));
          } else {
            setBusy(true);
            void session
              .discard()
              .then(() => router.replace("/create"))
              .catch((error) => session.report(error))
              .finally(() => setBusy(false));
          }
        }}
      />
      <ConfirmDialog
        open={removePiece !== null}
        onClose={() => setRemovePiece(null)}
        title={`Remove ${removePiece?.name ?? "this piece"}?`}
        description="Matches and outfit ideas will refresh for the remaining pieces. Your upload stays available."
        confirmLabel="Remove piece"
        busy={busy}
        onConfirm={() => {
          if (!look || !removePiece) return;
          setBusy(true);
          void session
            .savePieces(
              look.pieces.filter((piece) => piece.id !== removePiece.id),
            )
            .then(() => setRemovePiece(null))
            .catch((error) => session.report(error))
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
