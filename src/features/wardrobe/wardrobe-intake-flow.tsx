"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { recordPreviewActivity } from "@/lib/preview/activity";
import {
  wardrobePreviewStore,
  type WardrobePreviewRecord,
} from "./wardrobe-preview";
import { WardrobeIntake, type WardrobeProposal } from "./wardrobe-intake";
import {
  emptyDraft,
  manualFields,
  sampleDraft,
  wardrobeIntakeDraftStore,
  type IntakeDraft,
} from "./wardrobe-intake-draft";
import {
  deleteWardrobePhotoIfUnused,
  saveWardrobePhoto,
} from "./wardrobe-intake-storage";
import type { WardrobeCategory } from "./wardrobe-types";
import styles from "./wardrobe-intake.module.css";

type ConfirmAction = "replace" | "sample" | "discard";

function IntakeActionDialog({
  action,
  busy,
  onClose,
  onConfirm,
}: {
  action: ConfirmAction | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (action && !dialog.open) {
      restoreFocus.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>("[data-safe]")?.focus();
    } else if (!action && dialog.open) {
      dialog.close();
      restoreFocus.current?.focus();
    }
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [action]);
  const title =
    action === "discard" ? "Discard this draft?" : "Replace this draft photo?";
  const description =
    action === "discard"
      ? "The saved photo and unsaved details will be removed from this browser."
      : "The current photo and its unsaved details will be replaced.";
  return (
    <dialog
      ref={ref}
      className={styles.actionDialog}
      aria-labelledby="intake-action-title"
      aria-describedby="intake-action-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="intake-action-title">{title}</h2>
      <p id="intake-action-description">{description}</p>
      <div className={styles.actionDialogActions}>
        <Button data-safe variant="secondary" onClick={onClose} disabled={busy}>
          Keep draft
        </Button>
        <Button variant="primary" onClick={onConfirm} disabled={busy}>
          {action === "discard" ? "Discard draft" : "Replace photo"}
        </Button>
      </div>
    </dialog>
  );
}

export function WardrobeIntakeFlow({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const draft = wardrobeIntakeDraftStore.useValue();
  const ready = wardrobeIntakeDraftStore.useReady();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(
    null,
  );
  const pendingFile = useRef<File | null>(null);

  const hasDraft = draft.status !== "empty";
  const proposal: WardrobeProposal = {
    id: "draft",
    name: draft.name,
    category: draft.category,
    imageUrl: draft.imageUrl,
    imageKey: draft.imageKey,
    fields: draft.fields,
  };
  const status = busy
    ? "uploading"
    : draft.status === "photo_ready"
      ? "error"
      : draft.status === "added"
        ? "added"
        : draft.status === "manual" || draft.status === "sample"
          ? "ready"
          : error
            ? "error"
            : "empty";

  function updateDraft(update: (current: IntakeDraft) => IntakeDraft) {
    try {
      wardrobeIntakeDraftStore.set(update);
      setError(null);
      return true;
    } catch {
      setError(
        "This browser could not save the draft. Free some storage and retry.",
      );
      return false;
    }
  }

  async function acceptFile(file: File) {
    setBusy(true);
    setError(null);
    let nextKey: string | undefined;
    try {
      nextKey = await saveWardrobePhoto(file);
      const previousKey = draft.imageKey;
      const saved = updateDraft(() => ({
        status: "photo_ready",
        itemId: crypto.randomUUID(),
        imageKey: nextKey,
        name: "",
        category: "top",
        fields: manualFields,
        isSample: false,
      }));
      if (!saved) {
        await deleteWardrobePhotoIfUnused(nextKey);
        setRetryFile(file);
        recordPreviewActivity(
          "Wardrobe photo check",
          "failed",
          "The local draft could not be saved.",
        );
        return;
      }
      if (previousKey)
        await deleteWardrobePhotoIfUnused(previousKey).catch(() => undefined);
      setRetryFile(null);
      recordPreviewActivity(
        "Wardrobe photo check",
        "complete",
        "The image passed local file checks.",
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The photo could not be saved. Retry with another image.",
      );
      setRetryFile(file);
      recordPreviewActivity(
        "Wardrobe photo check",
        "failed",
        "The image could not be checked or stored.",
      );
    } finally {
      setBusy(false);
    }
  }

  function handlePickImage(file: File) {
    if (hasDraft) {
      pendingFile.current = file;
      setConfirmAction("replace");
    } else {
      void acceptFile(file);
    }
  }

  async function applyConfirmation() {
    if (confirmAction === "replace" && pendingFile.current) {
      const file = pendingFile.current;
      pendingFile.current = null;
      setConfirmAction(null);
      await acceptFile(file);
      return;
    }
    if (confirmAction === "sample") {
      const previousKey = draft.imageKey;
      if (updateDraft(() => sampleDraft()) && previousKey) {
        await deleteWardrobePhotoIfUnused(previousKey).catch(() => undefined);
      }
    } else if (confirmAction === "discard") {
      const previousKey = draft.imageKey;
      if (updateDraft(() => emptyDraft)) {
        if (previousKey)
          await deleteWardrobePhotoIfUnused(previousKey).catch(() => undefined);
        onClose();
      }
    }
    setConfirmAction(null);
  }

  function addItem() {
    if (!draft.name.trim() || (!draft.imageKey && !draft.imageUrl)) {
      setError("Add a name and photo before saving the item.");
      return;
    }
    const itemId = draft.itemId ?? crypto.randomUUID();
    if (!draft.itemId && !updateDraft((current) => ({ ...current, itemId })))
      return;
    const record: WardrobePreviewRecord = {
      id: itemId,
      name: draft.name.trim(),
      category: draft.category,
      inventoryStatus: "owned",
      imageUrl: draft.imageUrl ?? "",
      ...(draft.imageKey ? { imageKey: draft.imageKey } : {}),
      fields: draft.fields
        .filter((field) => field.value.trim())
        .map((field) => ({
          ...field,
          value: field.value.trim(),
        })),
      createdAt: new Date().toISOString(),
      isSample: draft.isSample,
    };
    let savedRecord = wardrobePreviewStore
      .get()
      .find((saved) => saved.id === itemId);
    try {
      if (!savedRecord) {
        wardrobePreviewStore.set((records) => [record, ...records]);
        savedRecord = record;
      }
    } catch {
      setError(
        "This browser could not save the item. Free some storage and retry.",
      );
      return;
    }
    try {
      wardrobeIntakeDraftStore.set((current) => ({
        ...current,
        status: "added",
        itemId,
        name: savedRecord.name,
        category: savedRecord.category,
        fields: savedRecord.fields,
        imageKey: savedRecord.imageKey,
        imageUrl: savedRecord.imageUrl,
        isSample: savedRecord.isSample,
      }));
      setError(null);
    } catch {
      setError(
        "The item was added, but this view could not advance. Retry Add to continue; it will not create a duplicate.",
      );
    }
  }

  function addAnotherFromPhoto() {
    if (!draft.imageKey) return;
    updateDraft((current) => ({
      ...current,
      status: "manual",
      itemId: crypto.randomUUID(),
      name: "",
      category: "top",
      fields: manualFields,
      isSample: false,
    }));
  }

  function finishAdding() {
    const photoKey = draft.imageKey;
    if (updateDraft(() => emptyDraft)) {
      if (photoKey)
        void deleteWardrobePhotoIfUnused(photoKey).catch(() => undefined);
      onClose();
    }
  }

  return (
    <>
      <WardrobeIntake
        open={open && ready}
        status={status}
        proposals={
          status === "ready" ||
          status === "added" ||
          draft.status === "photo_ready"
            ? [proposal]
            : []
        }
        selectedProposalId="draft"
        descriptionSource={draft.isSample ? "sample" : "manual"}
        hasDraft={hasDraft}
        busy={busy}
        errorTitle={
          draft.status === "photo_ready" && !error
            ? "Your photo is ready"
            : "Photo could not be saved"
        }
        errorMessage={
          error ??
          (draft.status === "photo_ready"
            ? "Automatic descriptions are unavailable in this sample workspace. Enter the garment details to continue."
            : undefined)
        }
        inlineError={
          status === "ready" || status === "added"
            ? (error ?? undefined)
            : undefined
        }
        onClose={onClose}
        onPickImage={handlePickImage}
        onSelectProposal={() => undefined}
        onNameChange={(_, name) => {
          updateDraft((current) => ({ ...current, name: name.slice(0, 160) }));
        }}
        onCategoryChange={(_, category: WardrobeCategory) => {
          updateDraft((current) => ({ ...current, category }));
        }}
        onFieldChange={(_, key, value) => {
          updateDraft((current) => ({
            ...current,
            fields: current.fields.map((field) =>
              field.key === key
                ? { ...field, value: value.slice(0, 500), source: "user" }
                : field,
            ),
          }));
        }}
        onConfirm={addItem}
        onAddAnother={
          draft.status === "added" && draft.imageKey
            ? addAnotherFromPhoto
            : undefined
        }
        onFinish={draft.status === "added" ? finishAdding : undefined}
        onManualEntry={
          draft.status === "photo_ready"
            ? () => {
                updateDraft((current) => ({ ...current, status: "manual" }));
              }
            : undefined
        }
        onUseSample={() => {
          if (hasDraft) setConfirmAction("sample");
          else updateDraft(() => sampleDraft());
        }}
        onRetry={
          retryFile && draft.status !== "photo_ready"
            ? () => {
                void acceptFile(retryFile);
              }
            : undefined
        }
        retryLabel="Retry photo check"
        onDiscardDraft={
          draft.status === "added"
            ? undefined
            : () => setConfirmAction("discard")
        }
      />
      <IntakeActionDialog
        action={confirmAction}
        busy={busy}
        onClose={() => {
          pendingFile.current = null;
          setConfirmAction(null);
        }}
        onConfirm={() => {
          void applyConfirmation();
        }}
      />
    </>
  );
}
