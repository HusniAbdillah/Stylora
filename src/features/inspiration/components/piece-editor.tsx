"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  Chip,
  ConfirmDialog,
  Icon,
  SelectField,
} from "@/components/ui";
import type { DetectedPiece, PieceEditValues } from "./types";
import styles from "./create-presentation.module.css";

const categories: { value: DetectedPiece["category"]; label: string }[] = [
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "dress", label: "Dress or one-piece" },
  { value: "outerwear", label: "Outerwear" },
  { value: "shoes", label: "Shoes" },
  { value: "accessory", label: "Accessory" },
];

function fromPiece(piece?: DetectedPiece | null): PieceEditValues {
  const byLabel = (label: string) =>
    piece?.attributes?.find(
      (entry) => entry.label.toLowerCase() === label.toLowerCase(),
    )?.value ?? "";
  return {
    name: piece?.name ?? "",
    category: piece?.category ?? "top",
    colors: piece?.colors?.map((color) => color.name).join(", ") ?? "",
    apparentMaterial: byLabel("Fabric look"),
    pattern: byLabel("Pattern"),
    texture: byLabel("Texture"),
    fit: byLabel("Fit"),
    cut: byLabel("Cut"),
    length: byLabel("Length"),
    occasion: byLabel("Occasion"),
    styleTags: byLabel("Styling"),
    ...piece?.editValues,
  };
}

function EditorField({
  label,
  value,
  onChange,
  suggestions = [],
  hint,
  choiceOnly = false,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions?: string[];
  hint?: string;
  choiceOnly?: boolean;
  className?: string;
}) {
  const [typing, setTyping] = useState(false);
  const knownChoice = suggestions.some(
    (suggestion) => suggestion.toLowerCase() === value.toLowerCase(),
  );
  const id = `piece-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div
      className={`${choiceOnly ? styles.editorChoice : styles.editorField} ${className ?? ""}`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
        </label>
        {choiceOnly && (
          <button
            type="button"
            onClick={() => setTyping((current) => !current)}
            className="flex size-11 items-center justify-center rounded-lg text-secondary md:hidden"
            aria-label={`Type a custom ${label.toLowerCase()}`}
            aria-expanded={typing || !knownChoice}
          >
            <Icon name="edit" className="size-4" />
          </button>
        )}
      </div>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`min-h-11 w-full rounded-lg border border-secondary bg-paper px-3 text-sm text-ink outline-none focus:border-crimson ${choiceOnly && knownChoice && !typing ? "hidden md:block" : ""}`}
        placeholder={hint}
        maxLength={label === "Name" ? 160 : 120}
      />
      {suggestions.length > 0 && (
        <div
          className={`mt-2 flex-wrap gap-1.5 ${choiceOnly ? "flex" : "hidden md:flex"}`}
        >
          {suggestions.map((suggestion) => (
            <Chip
              key={suggestion}
              selected={value.toLowerCase() === suggestion.toLowerCase()}
              onClick={() => onChange(suggestion)}
            >
              {suggestion}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

export type PieceEditorProps = {
  adoptionCount?: number;
  open: boolean;
  piece?: DetectedPiece | null;
  pieceNumber?: number;
  onClose: () => void;
  onSave: (values: PieceEditValues) => void | Promise<void>;
  onRemove?: (piece: DetectedPiece) => void | Promise<void>;
  initialValues?: Partial<PieceEditValues>;
  onDraftChange?: (values: PieceEditValues) => void;
  onDiscardDraft?: () => void;
};

export function PieceEditor(props: PieceEditorProps) {
  if (!props.open) return null;
  return <PieceEditorPanel key={props.piece?.id ?? "new-piece"} {...props} />;
}

function PieceEditorPanel({
  piece,
  pieceNumber,
  adoptionCount,
  onClose,
  onSave,
  onRemove,
  initialValues,
  onDraftChange,
  onDiscardDraft,
}: PieceEditorProps) {
  const [values, setValues] = useState<PieceEditValues>(() => ({
    ...fromPiece(piece),
    ...initialValues,
  }));
  const [confirmAction, setConfirmAction] = useState<
    "save" | "remove" | "discard" | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => nameRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = previous;
      window.clearTimeout(timer);
      previousFocus?.focus();
    };
  }, []);

  const set = (key: keyof PieceEditValues) => (value: string) => {
    const next = { ...values, [key]: value };
    setValues(next);
    onDraftChange?.(next);
  };
  const original = fromPiece(piece);
  const changed = Object.keys(values).some(
    (key) =>
      values[key as keyof PieceEditValues] !==
      original[key as keyof PieceEditValues],
  );
  const requestClose = () => {
    if (!busy) onClose();
  };
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(values);
      setConfirmAction(null);
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Changes could not be saved. Your edits are still here.",
      );
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!piece || !onRemove) return;
    setBusy(true);
    setError(null);
    try {
      await onRemove(piece);
      setConfirmAction(null);
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "This piece could not be removed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-night/45"
        onClick={requestClose}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="piece-editor-title"
        className={styles.editorPanel}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !confirmAction) requestClose();
          if (event.key === "Tab") {
            const controls = panelRef.current?.querySelectorAll<HTMLElement>(
              "button:not([disabled]), input:not([disabled]), select:not([disabled])",
            );
            const focusable = controls
              ? Array.from(controls).filter(
                  (control) => control.getClientRects().length > 0,
                )
              : [];
            if (!focusable?.length) return;
            const first = focusable[0],
              last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-stone md:hidden"
          aria-hidden="true"
        />
        <header className="flex shrink-0 items-start justify-between gap-4 px-5 pb-4 pt-4 md:px-7 md:pt-7">
          <div>
            <p className="text-xs font-semibold text-crimson">
              {piece
                ? `Edit piece${pieceNumber ? ` ${pieceNumber}` : ""}`
                : "Add piece"}
            </p>
            <h2
              id="piece-editor-title"
              className="mt-1 font-serif text-[26px] leading-tight md:text-[32px]"
            >
              {piece?.name || "Describe a piece"}
            </h2>
            <p className="mt-2 hidden text-[13px] leading-[19px] text-secondary md:block">
              Fix what looks wrong. Your words are kept exactly as typed;
              suggestions are optional.
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg"
            disabled={busy}
            aria-label="Close piece editor"
          >
            <Icon name="x" className="size-5" />
          </button>
        </header>
        <fieldset
          disabled={busy}
          className={`${styles.editorFields} m-0 min-h-0 min-w-0 flex-1 border-0 overflow-y-auto px-5 pb-5 md:px-7`}
        >
          <div className={styles.editorName}>
            <label
              htmlFor="piece-name"
              className="mb-1.5 block text-sm font-medium"
            >
              Name
            </label>
            <input
              ref={nameRef}
              id="piece-name"
              value={values.name}
              onChange={(event) => set("name")(event.target.value)}
              maxLength={160}
              className="min-h-11 w-full rounded-lg border border-secondary bg-paper px-3 text-sm outline-none focus:border-crimson"
            />
          </div>
          <div className={styles.editorAdditional} data-open={additionalOpen}>
            <button
              type="button"
              className="flex min-h-11 items-center gap-2 text-sm text-crimson md:hidden"
              aria-expanded={additionalOpen}
              aria-controls="piece-additional-fields"
              onClick={() => setAdditionalOpen((current) => !current)}
            >
              More garment details{" "}
              <Icon name="chevron-down" className="size-4" />
            </button>
            <div id="piece-additional-fields">
              <div className={styles.editorCategory}>
                <label
                  htmlFor="piece-category"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Category
                </label>
                <SelectField
                  id="piece-category"
                  value={values.category}
                  onChange={(event) => {
                    const choice = categories.find(
                      (category) => category.value === event.target.value,
                    );
                    if (choice) set("category")(choice.value);
                  }}
                >
                  {categories.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </SelectField>
              </div>
              <EditorField
                label="Colors"
                className={styles.editorColors}
                value={values.colors}
                onChange={set("colors")}
                hint="For example, camel, ivory"
              />
              <EditorField
                label="Pattern"
                className={styles.editorExtra}
                value={values.pattern}
                onChange={set("pattern")}
                suggestions={["Solid", "Stripe", "Check", "Floral"]}
              />
              <EditorField
                label="Texture"
                className={styles.editorExtra}
                value={values.texture}
                onChange={set("texture")}
                suggestions={["Smooth", "Ribbed", "Slubbed", "Textured"]}
              />
              <EditorField
                label="Cut"
                className={styles.editorExtra}
                value={values.cut}
                onChange={set("cut")}
                suggestions={["Straight", "Tapered", "A-line", "Boxy"]}
              />
              <EditorField
                label="Occasion"
                className={styles.editorExtra}
                value={values.occasion}
                onChange={set("occasion")}
                suggestions={["Everyday", "Work", "Evening", "Travel"]}
              />
              <EditorField
                label="Style tags"
                className={styles.editorExtra}
                value={values.styleTags}
                onChange={set("styleTags")}
                hint="Separate tags with commas"
              />
            </div>
          </div>
          <div className={styles.editorFabric}>
            <EditorField
              label="Fabric look"
              value={values.apparentMaterial}
              onChange={set("apparentMaterial")}
              suggestions={[
                "Cotton-like",
                "Wool-like",
                "Linen-like",
                "Leather-like",
              ]}
            />
          </div>
          <div className={styles.editorFit}>
            <EditorField
              label="Fit"
              value={values.fit}
              onChange={set("fit")}
              suggestions={["Fitted", "Regular", "Relaxed", "Oversized"]}
              choiceOnly
            />
          </div>
          <div className={styles.editorLength}>
            <EditorField
              label="Length"
              value={values.length}
              onChange={set("length")}
              suggestions={["Hip", "Knee length", "Below the knee", "Ankle"]}
              choiceOnly
            />
          </div>
          {piece && changed && (
            <p className="flex gap-2 rounded-xl bg-[var(--color-alternative-bg)] px-3 py-2 text-xs text-[var(--color-alternative)]">
              <Icon name="refresh" className="size-4 shrink-0" />
              Saving refreshes matches and ideas for this look.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-[var(--color-missing)]">
              {error}
            </p>
          )}
          {changed && (
            <button
              type="button"
              onClick={() => setConfirmAction("discard")}
              className="min-h-11 self-start text-sm text-crimson underline underline-offset-4"
              disabled={busy}
            >
              Discard unsaved edits
            </button>
          )}
        </fieldset>
        <footer className={styles.editorFooter}>
          <div>
            {piece && onRemove && (
              <Button
                type="button"
                variant="quiet"
                onClick={() => setConfirmAction("remove")}
                className="text-crimson"
              >
                <Icon name="trash" className="mr-1.5 size-4" />
                <span className="md:hidden">Remove</span>
                <span className="hidden md:inline">Remove piece</span>
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={requestClose}
              className="hidden md:inline-flex"
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() =>
                (piece && changed) || adoptionCount
                  ? setConfirmAction("save")
                  : void submit()
              }
              disabled={
                !values.name.trim() ||
                busy ||
                Boolean(piece && !changed && !adoptionCount)
              }
            >
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </footer>
      </aside>
      <ConfirmDialog
        open={confirmAction === "save"}
        title="Apply piece changes?"
        description={
          adoptionCount
            ? `Apply this edit and save all ${adoptionCount} complete provisional pieces? They will become reviewed pieces available for matching.`
            : "Matches and outfit ideas for this look will refresh. Your upload, other pieces and saved looks stay unchanged."
        }
        confirmLabel="Apply changes"
        onConfirm={() => void submit()}
        onClose={() => setConfirmAction(null)}
        busy={busy}
      >
        {error && (
          <p role="alert" className="mt-3 text-sm text-[var(--color-missing)]">
            {error}
          </p>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmAction === "remove"}
        title={`Remove ${piece?.name ?? "this piece"}?`}
        description="This piece will be removed from the current look and its matches and ideas will refresh. Saved looks stay unchanged."
        confirmLabel="Remove piece"
        onConfirm={() => void remove()}
        onClose={() => setConfirmAction(null)}
        busy={busy}
      >
        {error && (
          <p role="alert" className="mt-3 text-sm text-[var(--color-missing)]">
            {error}
          </p>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmAction === "discard"}
        title="Discard unsaved edits?"
        description="The changes you typed in this editor will be lost. Your saved pieces and look stay unchanged."
        confirmLabel="Discard edits"
        onConfirm={() => {
          setValues(original);
          if (onDiscardDraft) onDiscardDraft();
          else onDraftChange?.(original);
          setConfirmAction(null);
          onClose();
        }}
        onClose={() => setConfirmAction(null)}
        busy={busy}
      />
    </>
  );
}
