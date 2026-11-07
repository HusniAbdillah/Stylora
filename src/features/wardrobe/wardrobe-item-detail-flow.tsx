"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button, ConfirmDialog } from "@/components/ui";
import { createPreviewStore } from "@/lib/preview/store";
import {
  WardrobeDeleteDialog,
  WardrobeItemDetail,
} from "./wardrobe-item-detail";
import { getWardrobeCollectionHref } from "./wardrobe-navigation";
import {
  changeField,
  displayWardrobeItem,
  draftPointer,
  notifyWardrobeChanged,
  wardrobeRequest,
  type WardrobeDraft,
} from "./client";
import type { WardrobeItemDetailRecord } from "./server";
import {
  draftValuesSchema,
  itemValuesSchema,
  revisionSchema,
  type CanonicalWardrobeItem,
  type ItemValues,
} from "./schema";
import styles from "./wardrobe-detail.module.css";

const inlineDraftSchema = z.object({
  baseRevision: revisionSchema,
  values: draftValuesSchema,
  notes: z.string().max(4000),
  clearCorrections: z.array(z.string().max(160)).max(160),
});
type InlineDraft = z.infer<typeof inlineDraftSchema>;

function draftFromItem(item: CanonicalWardrobeItem): InlineDraft {
  return {
    baseRevision: item.revision,
    values: {
      name: item.name,
      category: item.category,
      subcategory: item.subcategory,
      description: item.description,
      attributes: item.attributes,
    },
    notes: item.notes,
    clearCorrections: [],
  };
}

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
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<
    "delete" | "owned" | "discard" | null
  >(null);
  const [fieldText, setFieldText] = useState<Record<string, string>>({});
  const [temporaryDraft, setTemporaryDraft] = useState<InlineDraft | null>();
  const draftStore = useMemo(
    () =>
      createPreviewStore<InlineDraft | null>(
        `wardrobe-inline-editor:${itemId}`,
        null,
        (value) => value === null || inlineDraftSchema.safeParse(value).success,
      ),
    [itemId],
  );
  const persistedDraft = draftStore.useValue();
  const ready = draftStore.useReady();
  const changedDraft =
    temporaryDraft === undefined ? persistedDraft : temporaryDraft;
  const draft = changedDraft ?? (item ? draftFromItem(item) : null);
  const oldPointer = `stylora:wardrobe-editor.v1:${itemId}`;

  function report(failure: unknown) {
    setError(
      failure instanceof Error
        ? failure.message
        : "The item could not be saved. Try again.",
    );
  }

  function persist(next: InlineDraft | null) {
    try {
      draftStore.set(next);
      setTemporaryDraft(undefined);
      return true;
    } catch {
      setTemporaryDraft(next);
      setNotice(
        "Your edits are available on this page. This browser could not keep a draft for later.",
      );
      return false;
    }
  }

  useEffect(() => {
    const oldId = draftPointer(oldPointer);
    if (!oldId || draftStore.get()) return;
    let active = true;
    wardrobeRequest<WardrobeDraft>(`/drafts/${oldId}`)
      .then((saved) => {
        if (!active || draftStore.get()) return;
        const editor = saved.payload.editor;
        if (saved.status !== "active" || editor?.itemId !== itemId) return;
        const recovered: InlineDraft = {
          baseRevision: editor.baseRevision,
          values: editor.values,
          notes: editor.notes,
          clearCorrections: [],
        };
        try {
          draftStore.set(recovered);
        } catch {
          setTemporaryDraft(recovered);
        }
      })
      .catch(() => {
        // The item remains editable when an older server draft is unavailable.
      });
    return () => {
      active = false;
    };
  }, [draftStore, itemId, oldPointer]);

  function update(
    values: ItemValues,
    notes = draft?.notes ?? "",
    changedKey?: string,
  ) {
    if (!draft || busy) return;
    setError(undefined);
    setNotice(undefined);
    persist({
      ...draft,
      values,
      notes,
      clearCorrections: draft.clearCorrections.filter(
        (key) => key !== changedKey,
      ),
    });
  }

  async function save() {
    if (!draft || !item) return;
    const parsed = itemValuesSchema.safeParse(draft.values);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue.path
        .map(String)
        .join(" ")
        .replace(/^attributes /, "");
      setError(
        `${field ? `${field.charAt(0).toUpperCase()}${field.slice(1)}: ` : ""}${issue.message}`,
      );
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const saved = await wardrobeRequest<CanonicalWardrobeItem>(
        `/${item.id}`,
        "PATCH",
        {
          action: "edit",
          expectedRevision: draft.baseRevision,
          values: parsed.data,
          notes: draft.notes,
          clearCorrections: draft.clearCorrections,
        },
      );
      setItem({ ...item, ...saved });
      const cleared = persist(null);
      draftPointer(oldPointer, null);
      setFieldText({});
      setNotice(
        cleared
          ? "Changes saved."
          : "Changes saved. This browser could not clear its older draft.",
      );
      notifyWardrobeChanged();
    } catch (failure) {
      report(failure);
    } finally {
      setBusy(false);
    }
  }

  async function removeItem() {
    if (!item) return;
    setBusy(true);
    setError(undefined);
    try {
      await wardrobeRequest(`/${item.id}`, "DELETE", {
        expectedRevision: item.revision,
      });
      persist(null);
      draftPointer(oldPointer, null);
      notifyWardrobeChanged();
      setConfirmation(null);
      router.push(getWardrobeCollectionHref());
    } catch (failure) {
      report(failure);
    } finally {
      setBusy(false);
    }
  }

  async function markOwned() {
    if (!item) return;
    setBusy(true);
    setError(undefined);
    try {
      const saved = await wardrobeRequest<CanonicalWardrobeItem>(
        `/${item.id}`,
        "PATCH",
        {
          action: "mark_owned",
          expectedRevision: item.revision,
        },
      );
      setItem({ ...item, ...saved });
      if (draft && changedDraft && draft.baseRevision === item.revision)
        persist({ ...draft, baseRevision: saved.revision });
      notifyWardrobeChanged();
      setConfirmation(null);
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

  if (!item || !draft)
    return (
      <section className={styles.notFound}>
        <h1>Item unavailable</h1>
        <p>{error ?? "This item is no longer available in the wardrobe."}</p>
        <Button variant="secondary" onClick={() => void reload()}>
          Retry item
        </Button>
        <Button
          variant="quiet"
          onClick={() => router.push(getWardrobeCollectionHref())}
        >
          Back to wardrobe
        </Button>
      </section>
    );

  const displayed = displayWardrobeItem({
    ...item,
    ...draft.values,
    notes: draft.notes,
  });
  const savedFields = displayWardrobeItem(item).fields;
  const changed =
    Boolean(changedDraft) &&
    JSON.stringify(draft) !== JSON.stringify(draftFromItem(item));
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
            Reload item
          </Button>
        </div>
      )}
      {draft.baseRevision !== item.revision && (
        <div className={styles.flowError} role="status">
          <span>
            This item changed while you were editing. Your draft is kept. Reload
            the saved item or keep a copy of your edits before starting again.
          </span>
          <Button
            variant="secondary"
            onClick={() => setConfirmation("discard")}
            disabled={busy}
          >
            Use saved details
          </Button>
        </div>
      )}
      {notice && (
        <p className={styles.saveNotice} role="status">
          {notice}
        </p>
      )}
      <WardrobeItemDetail
        item={{
          ...displayed,
          fields: displayed.fields.map((field) => ({
            ...field,
            value: fieldText[field.key] ?? field.value,
            source:
              savedFields.find((saved) => saved.key === field.key)?.value !==
              field.value
                ? "user"
                : field.source,
          })),
        }}
        busy={busy}
        saveDisabled={
          !ready ||
          !changed ||
          !draft.values.name.trim() ||
          draft.baseRevision !== item.revision
        }
        onBack={() => router.push(getWardrobeCollectionHref())}
        onNameChange={(name) => update({ ...draft.values, name })}
        onCategoryChange={(category) => update({ ...draft.values, category })}
        onSubcategoryChange={(subcategory) =>
          update({ ...draft.values, subcategory: subcategory || null })
        }
        onFieldChange={(key, text) => {
          setFieldText((previous) => ({ ...previous, [key]: text }));
          if (key === "notes") update(draft.values, text, key);
          else update(changeField(draft.values, key, text), draft.notes, key);
        }}
        onFieldBlur={(key) =>
          setFieldText((previous) => {
            const next = { ...previous };
            delete next[key];
            return next;
          })
        }
        correctedFields={Object.keys(item.corrections)}
        originalReadings={draft.clearCorrections}
        onUseOriginal={(key) =>
          persist({
            ...draft,
            clearCorrections: [...draft.clearCorrections, key],
          })
        }
        onMarkOwned={() => setConfirmation("owned")}
        onDelete={() => setConfirmation("delete")}
        onSave={() => void save()}
        onOpenSavedLook={(id) => router.push(`/saved-looks/${id}`)}
      />
      <WardrobeDeleteDialog
        open={confirmation === "delete"}
        itemName={item.name}
        itemImageUrl={item.imageUrl}
        busy={busy}
        errorMessage={error}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => void removeItem()}
      />
      <ConfirmDialog
        open={confirmation === "owned" || confirmation === "discard"}
        title={
          confirmation === "discard"
            ? "Use saved details?"
            : "Mark this item as owned?"
        }
        description={
          confirmation === "discard"
            ? "This removes your unsaved edits and shows the current saved item details."
            : "The saved candidate will become an owned wardrobe piece."
        }
        confirmLabel={
          confirmation === "discard" ? "Use saved details" : "Mark as owned"
        }
        busy={busy}
        onClose={() => setConfirmation(null)}
        onConfirm={() => {
          if (confirmation === "owned") void markOwned();
          else {
            persist(null);
            setFieldText({});
            setNotice(undefined);
            setConfirmation(null);
          }
        }}
      />
    </>
  );
}
