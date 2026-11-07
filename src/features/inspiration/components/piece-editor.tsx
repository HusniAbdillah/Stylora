"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Chip, ConfirmDialog, Icon } from "@/components/ui";
import type { DetectedPiece, PieceEditValues } from "./types";

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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions?: string[];
  hint?: string;
}) {
  const id = `piece-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-lg border border-secondary bg-paper px-3 text-sm text-ink outline-none focus:border-crimson"
        placeholder={hint}
        maxLength={label === "Name" ? 160 : 120}
      />
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((suggestion) => (
            <Chip
              key={suggestion}
              selected={value === suggestion}
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
  open: boolean;
  piece?: DetectedPiece | null;
  pieceNumber?: number;
  onClose: () => void;
  onSave: (values: PieceEditValues) => void | Promise<void>;
  onRemove?: (piece: DetectedPiece) => void | Promise<void>;
};

export function PieceEditor(props: PieceEditorProps) {
  if (!props.open) return null;
  return <PieceEditorPanel key={props.piece?.id ?? "new-piece"} {...props} />;
}

function PieceEditorPanel({
  piece,
  pieceNumber,
  onClose,
  onSave,
  onRemove,
}: PieceEditorProps) {
  const [values, setValues] = useState<PieceEditValues>(() => fromPiece(piece));
  const [confirmAction, setConfirmAction] = useState<
    "save" | "remove" | "discard" | null
  >(null);
  const [busy, setBusy] = useState(false);
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

  const set = (key: keyof PieceEditValues) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const original = fromPiece(piece);
  const changed = Object.keys(values).some(
    (key) =>
      values[key as keyof PieceEditValues] !==
      original[key as keyof PieceEditValues],
  );
  const requestClose = () =>
    changed ? setConfirmAction("discard") : onClose();
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(values);
      setConfirmAction(null);
      onClose();
    } catch {
      setError("Changes could not be saved. Your edits are still here.");
      setConfirmAction(null);
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
    } catch {
      setError("This piece could not be removed. Please try again.");
      setConfirmAction(null);
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
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[94dvh] flex-col overflow-hidden rounded-t-[24px] bg-paper shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[min(520px,100vw)] md:rounded-none"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !confirmAction) requestClose();
          if (event.key === "Tab") {
            const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
              "button:not([disabled]), input:not([disabled]), select:not([disabled])",
            );
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
            <h2 id="piece-editor-title" className="mt-1 font-serif text-3xl">
              {piece?.name || "Describe a piece"}
            </h2>
            <p className="mt-2 text-xs leading-5 text-secondary">
              Fix what looks wrong. Your words are kept exactly as typed;
              suggestions are optional.
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg"
            aria-label="Close piece editor"
          >
            <Icon name="x" className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5 md:px-7">
          <div>
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
          <div>
            <label
              htmlFor="piece-category"
              className="mb-1.5 block text-sm font-medium"
            >
              Category
            </label>
            <select
              id="piece-category"
              value={values.category}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  category: event.target.value as PieceEditValues["category"],
                }))
              }
              className="min-h-11 w-full rounded-lg border border-secondary bg-paper px-3 text-sm"
            >
              <>
                {categories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </>
            </select>
          </div>
          <EditorField
            label="Colors"
            value={values.colors}
            onChange={set("colors")}
            hint="For example, camel, ivory"
          />
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
          <EditorField
            label="Pattern"
            value={values.pattern}
            onChange={set("pattern")}
            suggestions={["Solid", "Stripe", "Check", "Floral"]}
          />
          <EditorField
            label="Texture"
            value={values.texture}
            onChange={set("texture")}
            suggestions={["Smooth", "Ribbed", "Slubbed", "Textured"]}
          />
          <EditorField
            label="Fit"
            value={values.fit}
            onChange={set("fit")}
            suggestions={["Fitted", "Regular", "Relaxed", "Oversized"]}
          />
          <EditorField
            label="Cut"
            value={values.cut}
            onChange={set("cut")}
            suggestions={["Straight", "Tapered", "A-line", "Boxy"]}
          />
          <EditorField
            label="Length"
            value={values.length}
            onChange={set("length")}
            suggestions={["Hip", "Knee length", "Below the knee", "Ankle"]}
          />
          <EditorField
            label="Occasion"
            value={values.occasion}
            onChange={set("occasion")}
            suggestions={["Everyday", "Work", "Evening", "Travel"]}
          />
          <EditorField
            label="Style tags"
            value={values.styleTags}
            onChange={set("styleTags")}
            hint="Separate tags with commas"
          />
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
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-stone bg-paper px-5 py-3 md:px-7">
          <div>
            {piece && onRemove && (
              <Button
                type="button"
                variant="quiet"
                onClick={() => setConfirmAction("remove")}
                className="text-crimson"
              >
                <Icon name="trash" className="mr-1.5 size-4" />
                Remove piece
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={requestClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() =>
                piece && changed ? setConfirmAction("save") : void submit()
              }
              disabled={
                !values.name.trim() || busy || Boolean(piece && !changed)
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
        description="Matches and outfit ideas for this look will refresh. Your upload, other pieces and saved looks stay unchanged."
        confirmLabel="Apply changes"
        onConfirm={() => void submit()}
        onClose={() => setConfirmAction(null)}
        busy={busy}
      />
      <ConfirmDialog
        open={confirmAction === "remove"}
        title={`Remove ${piece?.name ?? "this piece"}?`}
        description="This piece will be removed from the current look and its matches and ideas will refresh. Saved looks stay unchanged."
        confirmLabel="Remove piece"
        onConfirm={() => void remove()}
        onClose={() => setConfirmAction(null)}
        busy={busy}
      />
      <ConfirmDialog
        open={confirmAction === "discard"}
        title="Discard unsaved edits?"
        description="The changes you typed in this editor will be lost. Your saved pieces and look stay unchanged."
        confirmLabel="Discard edits"
        onConfirm={() => {
          setConfirmAction(null);
          onClose();
        }}
        onClose={() => setConfirmAction(null)}
        busy={busy}
      />
    </>
  );
}
