"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmDialog, SelectField } from "@/components/ui";
import {
  WardrobeArchiveDialog,
  WardrobeItemDetail,
} from "./wardrobe-item-detail";
import { validateWardrobePhoto } from "./wardrobe-intake-storage";
import { getWardrobeCollectionHref } from "./wardrobe-navigation";
import {
  changeField,
  displayWardrobeItem,
  draftPointer,
  itemFields,
  notifyWardrobeChanged,
  uploadWardrobeFile,
  wardrobeRequest,
  type WardrobeDraft,
} from "./client";
import type { WardrobeItemDetailRecord } from "./server";
import type { CanonicalWardrobeItem, ItemValues } from "./schema";
import { wardrobeCategories, type WardrobeCategory } from "./wardrobe-types";
import styles from "./wardrobe-detail.module.css";

export function WardrobeItemDetailFlow({
  itemId,
  initialItem,
  initialError,
}: {
  itemId: string;
  initialItem?: WardrobeItemDetailRecord;
  initialError?: string;
}) {
  const router = useRouter();
  const [item, setItem] = useState(initialItem);
  const [editor, setEditor] = useState<WardrobeDraft | null>(null);
  const editorRef = useRef(editor);
  const [editing, setEditing] = useState(false);
  const [clearCorrections, setClearCorrections] = useState<string[]>([]);
  const [error, setError] = useState(initialError);
  const [fieldText, setFieldText] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<
    "apply" | "discard" | "replace" | "owned" | null
  >(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const editNameInput = useRef<HTMLInputElement>(null);
  const dirty = useRef(false);
  const version = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pointer = `stylora:wardrobe-editor.v1:${itemId}`;
  function report(failure: unknown) {
    setError(
      failure instanceof Error
        ? failure.message
        : "The piece could not be saved. Try again.",
    );
  }
  const acceptEditor = useCallback((saved: WardrobeDraft | null) => {
    editorRef.current = saved;
    setEditor(saved);
  }, []);
  useEffect(() => {
    const id = draftPointer(pointer);
    if (!id) return;
    let active = true;
    wardrobeRequest<WardrobeDraft>(`/drafts/${id}`)
      .then((saved) => {
        if (!active) return;
        if (
          saved.status !== "active" ||
          saved.payload.editor?.itemId !== itemId
        ) {
          draftPointer(pointer, null);
          return;
        }
        acceptEditor(saved);
        setEditing(true);
      })
      .catch((failure) => {
        if (active) report(failure);
      });
    return () => {
      active = false;
    };
  }, [itemId, pointer, acceptEditor]);
  const flush = useCallback(() => {
    const task = queue.current
      .catch(() => undefined)
      .then(async () => {
        const snapshot = editorRef.current;
        if (!snapshot?.payload.editor || !dirty.current) return;
        const stamp = version.current;
        const saved = await wardrobeRequest<WardrobeDraft>(
          `/drafts/${snapshot.id}/editor`,
          "PATCH",
          {
            expectedRevision: snapshot.revision,
            values: snapshot.payload.editor.values,
            notes: snapshot.payload.editor.notes,
          },
        );
        if (stamp === version.current) {
          dirty.current = false;
          acceptEditor(saved);
        } else
          acceptEditor({ ...editorRef.current!, revision: saved.revision });
      });
    queue.current = task;
    return task;
  }, [acceptEditor]);
  useEffect(() => {
    if (!dirty.current) return;
    const timer = window.setTimeout(() => void flush().catch(report), 600);
    return () => window.clearTimeout(timer);
  }, [editor, flush]);
  async function beginEdit() {
    if (editor) {
      setEditing(true);
      return;
    }
    setBusy(true);
    try {
      const saved = await wardrobeRequest<WardrobeDraft>("/drafts", "POST", {
        itemId,
      });
      acceptEditor(saved);
      draftPointer(pointer, saved.id);
      setEditing(true);
      requestAnimationFrame(() => editNameInput.current?.focus());
    } catch (failure) {
      report(failure);
    } finally {
      setBusy(false);
    }
  }
  function update(
    values: ItemValues,
    notes = editorRef.current?.payload.editor?.notes ?? "",
  ) {
    const snapshot = editorRef.current;
    if (!snapshot?.payload.editor || busy) return;
    version.current++;
    dirty.current = true;
    acceptEditor({
      ...snapshot,
      payload: {
        ...snapshot.payload,
        editor: { ...snapshot.payload.editor, values, notes },
      },
    });
    setError(undefined);
  }
  async function clearDraft() {
    await queue.current.catch(() => undefined);
    const saved = editorRef.current;
    if (saved?.status === "active")
      await wardrobeRequest(`/drafts/${saved.id}`, "DELETE", {
        expectedRevision: saved.revision,
      });
    dirty.current = false;
    acceptEditor(null);
    draftPointer(pointer, null);
    setClearCorrections([]);
    setEditing(false);
  }
  async function mutate(action: string, extra = {}) {
    if (!item) return;
    setBusy(true);
    setError(undefined);
    try {
      const saved = await wardrobeRequest<CanonicalWardrobeItem>(
        `/${item.id}`,
        "PATCH",
        { action, expectedRevision: item.revision, ...extra },
      );
      setItem((previous) => (previous ? { ...previous, ...saved } : undefined));
      notifyWardrobeChanged();
      setConfirm(null);
      setArchiveOpen(false);
      return saved;
    } catch (failure) {
      report(failure);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    setBusy(true);
    try {
      await flush();
      const current = editorRef.current?.payload.editor;
      if (!current || !item) return;
      if (current.baseRevision !== item.revision)
        throw new Error(
          "This edit draft uses an older item revision. Discard it and reload the piece before editing again.",
        );
      const saved = await mutate("edit", {
        values: current.values,
        notes: current.notes,
        clearCorrections,
      });
      if (saved) await clearDraft();
    } catch (failure) {
      report(failure);
    } finally {
      setBusy(false);
    }
  }
  async function replacePhoto() {
    if (!pendingFile) return;
    setBusy(true);
    try {
      const draft = await wardrobeRequest<WardrobeDraft>("/drafts", "POST", {});
      const verified = await uploadWardrobeFile(pendingFile, draft);
      if (
        await mutate("replace_photo", {
          draftId: verified.id,
          draftRevision: verified.revision,
        })
      )
        setPendingFile(null);
    } catch (failure) {
      report(failure);
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    setBusy(true);
    try {
      setItem(await wardrobeRequest<WardrobeItemDetailRecord>(`/${itemId}`));
      setError(undefined);
    } catch (failure) {
      report(failure);
    } finally {
      setBusy(false);
    }
  }
  if (!item)
    return (
      <section className={styles.notFound}>
        <h1>Piece unavailable</h1>
        <p>
          {error ?? "This piece is no longer available in the shared wardrobe."}
        </p>
        <Button variant="secondary" onClick={() => void reload()}>
          Retry piece
        </Button>
        <Button
          variant="quiet"
          onClick={() => router.push(getWardrobeCollectionHref())}
        >
          Back to wardrobe
        </Button>
      </section>
    );
  const draft = editor?.payload.editor;
  const confirmations = {
    apply: [
      "Apply these edits?",
      "The reviewed values will replace the saved item details.",
      "Apply changes",
    ],
    discard: [
      "Discard unsaved edits?",
      "The saved item stays as it was. This edit draft will be removed.",
      "Discard edits",
    ],
    replace: [
      "Replace this photo?",
      "The current photo will be replaced. Its original description and evidence remain until you edit them.",
      "Replace photo",
    ],
    owned: [
      "Mark this item as owned?",
      "The saved candidate will become an owned wardrobe piece.",
      "Mark as owned",
    ],
  };
  return (
    <>
      {error && (
        <div className={styles.flowError} role="alert">
          <span>{error}</span>
          <Button
            variant="secondary"
            onClick={() => void reload()}
            disabled={busy}
          >
            Reload piece
          </Button>
        </div>
      )}
      <input
        ref={fileInput}
        className={styles.fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Replacement photo"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file)
            void validateWardrobePhoto(file)
              .then(() => {
                setPendingFile(file);
                setConfirm("replace");
              })
              .catch(report);
        }}
      />
      <WardrobeItemDetail
        item={{
          ...displayWardrobeItem(item),
          archived: Boolean(item.archivedAt),
        }}
        busy={busy}
        onBack={() => {
          void flush()
            .then(() => router.push(getWardrobeCollectionHref()))
            .catch(report);
        }}
        onReplacePhoto={() => fileInput.current?.click()}
        onMarkOwned={item.archivedAt ? undefined : () => setConfirm("owned")}
        onArchive={() => setArchiveOpen(true)}
        onRestore={() => void mutate("restore")}
        onEdit={() => void beginEdit()}
        editPanel={
          editing && draft ? (
            <section
              className={styles.editPanel}
              aria-labelledby="edit-item-heading"
            >
              <h2 id="edit-item-heading">Edit item details</h2>
              <p>
                Your draft is saved to the shared workspace. Apply it when the
                details are ready.
              </p>
              <label>
                Item name
                <input
                  ref={editNameInput}
                  value={draft.values.name}
                  maxLength={160}
                  onChange={(e) =>
                    update({ ...draft.values, name: e.target.value })
                  }
                />
              </label>
              <label>
                Category
                <SelectField
                  value={draft.values.category}
                  onChange={(e) =>
                    update({
                      ...draft.values,
                      category: e.target.value as WardrobeCategory,
                    })
                  }
                >
                  {wardrobeCategories
                    .filter((c) => c.id !== "all")
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                </SelectField>
              </label>
              <label>
                Subcategory
                <input
                  value={draft.values.subcategory ?? ""}
                  maxLength={120}
                  onChange={(e) =>
                    update({
                      ...draft.values,
                      subcategory: e.target.value || null,
                    })
                  }
                />
              </label>
              {itemFields({ ...draft.values, notes: draft.notes }).map(
                (field) => (
                  <label key={field.key}>
                    {field.label}
                    <input
                      value={fieldText[field.key] ?? field.value}
                      maxLength={
                        field.key === "notes"
                          ? 4000
                          : field.key === "description"
                            ? 600
                            : 500
                      }
                      onBlur={() =>
                        setFieldText((previous) => {
                          const next = { ...previous };
                          delete next[field.key];
                          return next;
                        })
                      }
                      onChange={(e) => {
                        setFieldText((previous) => ({
                          ...previous,
                          [field.key]: e.target.value,
                        }));
                        if (field.key === "notes")
                          update(draft.values, e.target.value);
                        else
                          update(
                            changeField(
                              draft.values,
                              field.key,
                              e.target.value,
                            ),
                          );
                      }}
                    />
                    {item.corrections[field.key] && (
                      <Button
                        variant="quiet"
                        disabled={clearCorrections.includes(field.key)}
                        onClick={() =>
                          setClearCorrections((paths) => [...paths, field.key])
                        }
                      >
                        {clearCorrections.includes(field.key)
                          ? "Original reading selected"
                          : "Use original reading"}
                      </Button>
                    )}
                  </label>
                ),
              )}
              <div className={styles.editActions}>
                <Button
                  variant="quiet"
                  disabled={busy}
                  onClick={() => setConfirm("discard")}
                >
                  Discard edits
                </Button>
                <Button
                  variant="primary"
                  disabled={busy || !draft.values.name.trim()}
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
        savedLookCount={item.savedLookCount}
        busy={busy}
        errorMessage={error}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={() => void mutate("archive")}
      />
      <ConfirmDialog
        open={confirm !== null}
        title={confirm ? confirmations[confirm][0] : ""}
        description={confirm ? confirmations[confirm][1] : ""}
        confirmLabel={confirm ? confirmations[confirm][2] : "Confirm"}
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm === "apply") void apply();
          if (confirm === "owned") void mutate("mark_owned");
          if (confirm === "replace") void replacePhoto();
          if (confirm === "discard") {
            setBusy(true);
            void clearDraft()
              .then(() => setConfirm(null))
              .catch(report)
              .finally(() => setBusy(false));
          }
        }}
      />
    </>
  );
}
