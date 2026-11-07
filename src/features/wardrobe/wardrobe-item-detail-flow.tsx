"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button, ConfirmDialog } from "@/components/ui";
import { recordPreviewActivity } from "@/lib/preview/activity";
import { createPreviewStore } from "@/lib/preview/store";
import {
  wardrobePreviewStore,
  type WardrobePreviewRecord,
} from "./wardrobe-preview";
import {
  deleteWardrobePhotoIfUnused,
  saveWardrobePhoto,
  validateWardrobePhoto,
} from "./wardrobe-intake-storage";
import {
  WardrobeArchiveDialog,
  WardrobeItemDetail,
} from "./wardrobe-item-detail";
import { getWardrobeCollectionHref } from "./wardrobe-navigation";
import {
  wardrobeCategories,
  type WardrobeCategory,
  type WardrobeField,
} from "./wardrobe-types";
import styles from "./wardrobe-detail.module.css";

const editDraftSchema = z.object({
  name: z.string().max(160),
  category: z.enum([
    "top",
    "bottom",
    "dress",
    "outerwear",
    "shoes",
    "accessory",
  ]),
  subcategory: z.string().max(100),
  fields: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      value: z.string().max(500),
      source: z
        .enum(["user", "visual_inference", "catalog", "derived", "sample"])
        .optional(),
      editable: z.boolean().optional(),
    }),
  ),
});
type EditDraft = z.infer<typeof editDraftSchema>;
const editDraftStore = createPreviewStore<Record<string, EditDraft>>(
  "wardrobe-edit-drafts",
  {},
  (value) => z.record(z.string(), editDraftSchema).safeParse(value).success,
);

function fromRecord(item: WardrobePreviewRecord): EditDraft {
  return {
    name: item.name,
    category: item.category,
    subcategory: item.subcategory ?? "",
    fields: item.fields.map((field) => ({ ...field })),
  };
}

export function WardrobeItemDetailFlow({ itemId }: { itemId: string }) {
  const router = useRouter();
  const records = wardrobePreviewStore.useValue();
  const ready = wardrobePreviewStore.useReady();
  const editDrafts = editDraftStore.useValue();
  const item = records.find((record) => record.id === itemId);
  const draft = editDrafts[itemId] ?? (item ? fromRecord(item) : null);
  const fileInput = useRef<HTMLInputElement>(null);
  const editNameInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<
    "apply" | "discard" | "replace" | "owned" | null
  >(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRecord(
    update: (current: WardrobePreviewRecord) => WardrobePreviewRecord,
  ) {
    try {
      wardrobePreviewStore.set((previous) =>
        previous.map((record) =>
          record.id === itemId ? update(record) : record,
        ),
      );
      setError(null);
      return true;
    } catch {
      setError(
        "This browser could not save the item. Free some storage and retry.",
      );
      return false;
    }
  }

  function updateEdit(update: (current: EditDraft) => EditDraft) {
    if (!item) return;
    try {
      editDraftStore.set((previous) => ({
        ...previous,
        [itemId]: update(previous[itemId] ?? fromRecord(item)),
      }));
      setError(null);
    } catch {
      setError(
        "This browser could not save the edit draft. Free some storage and retry.",
      );
    }
  }

  function clearEditDraft() {
    try {
      editDraftStore.set((previous) => {
        const next = { ...previous };
        delete next[itemId];
        return next;
      });
      return true;
    } catch {
      setError(
        "The edit draft could not be cleared. Retry after freeing browser storage.",
      );
      return false;
    }
  }

  function applyEdit() {
    if (!draft?.name.trim()) {
      setError("Enter an item name before applying changes.");
      setConfirm(null);
      return;
    }
    if (
      updateRecord((current) => ({
        ...current,
        name: draft.name.trim(),
        category: draft.category,
        subcategory: draft.subcategory.trim() || null,
        fields: draft.fields.map((field) => ({
          ...field,
          value: field.value.trim(),
        })),
      }))
    ) {
      clearEditDraft();
      setEditing(false);
    }
    setConfirm(null);
  }

  function cancelEdit() {
    if (!item || !draft) return;
    if (JSON.stringify(draft) !== JSON.stringify(fromRecord(item))) {
      setConfirm("discard");
    } else if (clearEditDraft()) {
      setEditing(false);
    }
  }

  async function chooseReplacement(file: File) {
    setBusy(true);
    try {
      await validateWardrobePhoto(file);
      setPendingFile(file);
      setError(null);
      setConfirm("replace");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Choose another photo.",
      );
      recordPreviewActivity(
        "Wardrobe photo check",
        "failed",
        "The replacement image failed local checks.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function replacePhoto() {
    if (!pendingFile || !item) return;
    setBusy(true);
    let nextKey: string | undefined;
    try {
      nextKey = await saveWardrobePhoto(pendingFile);
      const oldKey = item.imageKey;
      if (
        !updateRecord((current) => ({
          ...current,
          imageKey: nextKey,
          imageUrl: "",
        }))
      ) {
        await deleteWardrobePhotoIfUnused(nextKey).catch(() => undefined);
        recordPreviewActivity(
          "Wardrobe photo check",
          "failed",
          "The replacement photo could not be saved to the item.",
        );
        return;
      }
      if (oldKey)
        await deleteWardrobePhotoIfUnused(oldKey).catch(() => undefined);
      setPendingFile(null);
      setConfirm(null);
      recordPreviewActivity(
        "Wardrobe photo check",
        "complete",
        "The replacement image passed local file checks.",
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The photo could not be replaced. Retry.",
      );
      recordPreviewActivity(
        "Wardrobe photo check",
        "failed",
        "The replacement image could not be stored.",
      );
    } finally {
      setBusy(false);
    }
  }

  function returnToWardrobe() {
    router.push(getWardrobeCollectionHref());
  }

  if (!ready) {
    return (
      <div
        className={styles.loading}
        role="status"
        aria-label="Loading wardrobe item"
      >
        <div />
        <div>
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }
  if (!item || !draft) {
    return (
      <section className={styles.notFound}>
        <h1>Item not found</h1>
        <p>This item is no longer in this browser&apos;s wardrobe preview.</p>
        <Button variant="secondary" onClick={returnToWardrobe}>
          Back to wardrobe
        </Button>
      </section>
    );
  }

  const changed = JSON.stringify(draft) !== JSON.stringify(fromRecord(item));
  const confirmations = {
    apply: {
      title: "Apply these edits?",
      description:
        "The item details will replace the saved values in this browser.",
      confirmLabel: "Apply changes",
    },
    discard: {
      title: "Discard unsaved edits?",
      description:
        "The saved item stays as it was. This edit draft will be removed.",
      confirmLabel: "Discard edits",
    },
    replace: {
      title: "Replace this photo?",
      description:
        "The current item photo will be replaced. Its description stays until you edit it.",
      confirmLabel: "Replace photo",
    },
    owned: {
      title: "Mark this item as owned?",
      description:
        "This changes its status from saved candidate to owned in this browser.",
      confirmLabel: "Mark as owned",
    },
  };

  return (
    <>
      {error && (
        <div className={styles.flowError} role="alert">
          <span>{error}</span>
          {pendingFile && !confirm && (
            <Button
              variant="secondary"
              onClick={() => {
                void replacePhoto();
              }}
            >
              Retry photo save
            </Button>
          )}
        </div>
      )}
      <input
        ref={fileInput}
        className={styles.fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Replacement photo"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void chooseReplacement(file);
          event.target.value = "";
        }}
      />
      <WardrobeItemDetail
        item={{ ...item, archived: Boolean(item.archivedAt) }}
        busy={busy}
        onBack={returnToWardrobe}
        onReplacePhoto={() => fileInput.current?.click()}
        onMarkOwned={item.archivedAt ? undefined : () => setConfirm("owned")}
        onArchive={() => setArchiveOpen(true)}
        onRestore={() => {
          updateRecord((current) => ({ ...current, archivedAt: null }));
        }}
        onEdit={() => {
          setEditing(true);
          requestAnimationFrame(() => editNameInput.current?.focus());
        }}
        editPanel={
          editing ? (
            <section
              className={styles.editPanel}
              aria-labelledby="edit-item-heading"
            >
              <h2 id="edit-item-heading">Edit item details</h2>
              <p>Your changes stay as a draft until you apply them.</p>
              <label>
                Item name
                <input
                  ref={editNameInput}
                  value={draft.name}
                  maxLength={160}
                  onChange={(event) =>
                    updateEdit((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Category
                <select
                  value={draft.category}
                  onChange={(event) =>
                    updateEdit((current) => ({
                      ...current,
                      category: event.target.value as WardrobeCategory,
                    }))
                  }
                >
                  {wardrobeCategories
                    .filter((category) => category.id !== "all")
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Subcategory
                <input
                  value={draft.subcategory}
                  maxLength={100}
                  onChange={(event) =>
                    updateEdit((current) => ({
                      ...current,
                      subcategory: event.target.value,
                    }))
                  }
                />
              </label>
              {draft.fields.map((field: WardrobeField) => (
                <label key={field.key}>
                  {field.label}
                  <input
                    value={field.value}
                    maxLength={500}
                    disabled={field.editable === false}
                    onChange={(event) =>
                      updateEdit((current) => ({
                        ...current,
                        fields: current.fields.map((candidate) =>
                          candidate.key === field.key
                            ? {
                                ...candidate,
                                value: event.target.value,
                                source: "user",
                              }
                            : candidate,
                        ),
                      }))
                    }
                  />
                </label>
              ))}
              <div className={styles.editActions}>
                <Button variant="quiet" onClick={cancelEdit}>
                  Cancel editing
                </Button>
                <Button
                  variant="primary"
                  disabled={!changed || !draft.name.trim()}
                  onClick={() => setConfirm("apply")}
                >
                  Apply edits
                </Button>
              </div>
            </section>
          ) : undefined
        }
      />
      <WardrobeArchiveDialog
        open={archiveOpen}
        itemName={item.name}
        itemImageUrl={item.imageUrl}
        itemImageKey={item.imageKey}
        savedLookCount={item.usedIn?.length ?? 0}
        busy={busy}
        errorMessage={error ?? undefined}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={() => {
          if (
            updateRecord((current) => ({
              ...current,
              archivedAt: new Date().toISOString(),
            }))
          ) {
            setArchiveOpen(false);
          }
        }}
      />
      <ConfirmDialog
        open={confirm !== null}
        title={confirm ? confirmations[confirm].title : ""}
        description={confirm ? confirmations[confirm].description : undefined}
        confirmLabel={confirm ? confirmations[confirm].confirmLabel : "Confirm"}
        busy={busy}
        onClose={() => {
          if (confirm === "replace") setPendingFile(null);
          setConfirm(null);
        }}
        onConfirm={() => {
          if (confirm === "apply") applyEdit();
          if (confirm === "discard" && clearEditDraft()) {
            setEditing(false);
            setConfirm(null);
          }
          if (
            confirm === "owned" &&
            updateRecord((current) => ({
              ...current,
              inventoryStatus: "owned",
            }))
          )
            setConfirm(null);
          if (confirm === "replace") void replacePhoto();
        }}
      />
    </>
  );
}
