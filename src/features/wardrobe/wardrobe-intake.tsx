"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Badge, Button, Icon, SelectField } from "@/components/ui";
import { WardrobePreviewImage } from "./wardrobe-intake-storage";
import {
  type WardrobeCategory,
  type WardrobeField,
  wardrobeCategories,
} from "./wardrobe-types";
import styles from "./wardrobe-intake.module.css";

export type WardrobeProposal = {
  id: string;
  name: string;
  category: WardrobeCategory;
  imageUrl?: string | null;
  imageKey?: string;
  fields: WardrobeField[];
};

export type WardrobeIntakeProps = {
  open: boolean;
  status: "empty" | "uploading" | "analyzing" | "ready" | "error" | "added";
  proposals: WardrobeProposal[];
  selectedProposalId?: string;
  errorMessage?: string;
  errorTitle?: string;
  inlineError?: string;
  onClose: () => void;
  onPickImage: (file: File) => void;
  onSelectProposal: (id: string) => void;
  onNameChange: (id: string, name: string) => void;
  onCategoryChange: (id: string, category: WardrobeCategory) => void;
  onFieldChange: (id: string, key: string, value: string) => void;
  onFieldBlur?: (id: string, key: string) => void;
  onConfirm: (id: string) => void;
  onRetry?: () => void;
  onManualEntry?: () => void;
  onUseSample?: () => void;
  onDiscardDraft?: () => void;
  onAddAnother?: () => void;
  onFinish?: () => void;
  retryLabel?: string;
  descriptionSource?: "ai" | "manual" | "sample";
  hasDraft?: boolean;
  busy?: boolean;
  provisionalCount?: number;
};

export function WardrobeIntake({
  open,
  status,
  proposals,
  selectedProposalId,
  errorMessage,
  errorTitle,
  inlineError,
  onClose,
  onPickImage,
  onSelectProposal,
  onNameChange,
  onCategoryChange,
  onFieldChange,
  onFieldBlur,
  onConfirm,
  onRetry,
  onManualEntry,
  onUseSample,
  onDiscardDraft,
  onAddAnother,
  onFinish,
  retryLabel = "Retry description",
  descriptionSource = "ai",
  hasDraft = false,
  busy = false,
  provisionalCount = 0,
}: WardrobeIntakeProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const fieldPrefix = useId();
  const selected =
    proposals.find((item) => item.id === selectedProposalId) ?? proposals[0];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      restoreFocusRef.current?.focus();
    }
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  const chooseFile = () => fileRef.current?.click();

  return (
    <dialog
      className={styles.dialog}
      ref={dialogRef}
      aria-labelledby="wardrobe-intake-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className={styles.handle} aria-hidden="true" />
      <header className={styles.header}>
        <h2 id="wardrobe-intake-title">Add a piece</h2>
        <button
          className={styles.close}
          type="button"
          aria-label="Close add item"
          onClick={onClose}
        >
          <Icon name="x" />
        </button>
      </header>

      <input
        ref={fileRef}
        className={styles.fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPickImage(file);
          event.target.value = "";
        }}
      />

      {inlineError && (
        <p className={styles.inlineError} role="alert">
          {inlineError}
        </p>
      )}

      {status === "empty" ? (
        <div className={styles.uploadPrompt}>
          <span className={styles.uploadIcon}>
            <Icon name="upload" size={26} />
          </span>
          <h3>Start with one photo</h3>
          <p>
            Choose a clear photo. Review the proposed descriptions before adding
            each piece to your wardrobe.
          </p>
          <Button variant="primary" onClick={chooseFile} disabled={busy}>
            Choose photo
          </Button>
          {onUseSample && (
            <Button variant="secondary" onClick={onUseSample} disabled={busy}>
              Try sample item
            </Button>
          )}
          <small>
            JPEG, PNG or WebP, up to 10 MB. Photos are saved to the shared
            wardrobe workspace.
          </small>
        </div>
      ) : status === "uploading" || status === "analyzing" ? (
        <div className={styles.progress} role="status" aria-live="polite">
          <div className={styles.progressImage}>
            <Icon name="image" size={32} />
          </div>
          <span className={styles.progressIcon}>
            <Icon name="sparkle" size={18} />
          </span>
          <h3>
            {status === "uploading"
              ? "Checking and saving your photo"
              : "Describing the piece"}
          </h3>
          <p>
            {status === "uploading"
              ? "The file is uploaded and checked before it joins your saved draft."
              : "Your uploaded draft is saved. You can return to review it later."}
          </p>
          {provisionalCount > 0 && (
            <p>
              {provisionalCount} garments described. Checking the complete
              result.
            </p>
          )}
          <div className={styles.progressBar} aria-hidden="true">
            <span />
          </div>
        </div>
      ) : status === "error" ? (
        <div className={styles.error} role={selected ? "status" : "alert"}>
          {selected?.imageKey ? (
            <div className={styles.photo}>
              <WardrobePreviewImage
                imageKey={selected.imageKey}
                alt="Selected wardrobe photo"
                retryable
              />
            </div>
          ) : (
            <Icon name="info" size={32} />
          )}
          <h3>{errorTitle ?? "Photo description is unavailable"}</h3>
          <p>
            {errorMessage ??
              "Choose another photo or enter the details yourself."}
          </p>
          <div className={styles.errorActions}>
            <Button variant="secondary" onClick={chooseFile} disabled={busy}>
              Choose another photo
            </Button>
            {onRetry && (
              <Button variant="primary" onClick={onRetry} disabled={busy}>
                {retryLabel}
              </Button>
            )}
            {onManualEntry && (
              <Button
                variant="secondary"
                onClick={onManualEntry}
                disabled={busy}
              >
                Enter details manually
              </Button>
            )}
            {onUseSample && (
              <Button variant="quiet" onClick={onUseSample} disabled={busy}>
                Try sample item
              </Button>
            )}
          </div>
        </div>
      ) : status === "added" && selected ? (
        <div className={styles.addedState} role="status">
          <div className={styles.photo}>
            <WardrobePreviewImage
              imageKey={selected.imageKey}
              fallbackUrl={selected.imageUrl}
              alt="Saved wardrobe photo"
            />
          </div>
          <h3>{selected.name} was added</h3>
          <p>
            The item is in the shared wardrobe. Its details are{" "}
            {descriptionSource === "sample"
              ? "labeled sample data"
              : descriptionSource === "ai"
                ? "read from the photo and reviewed by you"
                : "entered by you"}
            .
          </p>
          {onAddAnother && (
            <Button variant="primary" onClick={onAddAnother}>
              Add another garment from this photo
            </Button>
          )}
          {onFinish && (
            <Button
              variant={onAddAnother ? "secondary" : "primary"}
              onClick={onFinish}
            >
              Done
            </Button>
          )}
        </div>
      ) : selected ? (
        <div className={styles.ready}>
          {proposals.length > 1 && (
            <div className={styles.multiple} role="status">
              <Icon name="info" size={16} />
              <span>
                {proposals.length} garments were found. Review and add each
                piece separately.
              </span>
            </div>
          )}
          {proposals.length > 1 && (
            <div
              className={styles.proposalTabs}
              role="group"
              aria-label="Detected garments"
            >
              {proposals.map((proposal, index) => (
                <button
                  key={proposal.id}
                  type="button"
                  aria-pressed={proposal.id === selected.id}
                  onClick={() => {
                    setEditingKey(null);
                    onSelectProposal(proposal.id);
                  }}
                >
                  Piece {index + 1}
                </button>
              ))}
            </div>
          )}
          <div className={styles.summary}>
            <div className={styles.photo}>
              <WardrobePreviewImage
                imageKey={selected.imageKey}
                fallbackUrl={selected.imageUrl}
                alt="Selected wardrobe item"
              />
            </div>
            <div className={styles.summaryText}>
              <Badge tone={descriptionSource === "ai" ? "owned" : "neutral"}>
                {descriptionSource === "sample"
                  ? "Sample item"
                  : descriptionSource === "manual"
                    ? "Manual details"
                    : "Photo read"}
              </Badge>
              <label className={styles.nameLabel} data-field-surface="">
                <span className={styles.srOnly}>Item name</span>
                <input
                  value={selected.name}
                  maxLength={160}
                  onChange={(event) =>
                    onNameChange(selected.id, event.target.value)
                  }
                  aria-label="Item name"
                />
              </label>
              <p>
                {descriptionSource === "manual"
                  ? "Describe what you can see. You can edit these details later."
                  : "Check the details, then add it. You can change anything later."}
              </p>
              <Button variant="secondary" onClick={chooseFile} disabled={busy}>
                Replace photo
              </Button>
            </div>
          </div>
          <div className={styles.fields}>
            <SelectField
              label="Category"
              value={selected.category}
              onChange={(event) =>
                onCategoryChange(
                  selected.id,
                  event.target.value as WardrobeCategory,
                )
              }
            >
              {wardrobeCategories
                .filter((option) => option.id !== "all")
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
            </SelectField>
            {Array.from(
              selected.fields.reduce((groups, field) => {
                const group = field.group ?? field.label;
                const fields = groups.get(group) ?? [];
                fields.push(field);
                groups.set(group, fields);
                return groups;
              }, new Map<string, WardrobeField[]>()),
            ).map(([group, fields]) => (
              <div
                className={styles.field}
                key={group}
                role="group"
                aria-label={group}
                data-field-surface=""
              >
                <div className={styles.fieldText}>
                  <label
                    className={styles.groupLabel}
                    htmlFor={`${fieldPrefix}-${fields[0].key}`}
                  >
                    {group}
                  </label>
                  {fields.map((field) => (
                    <div className={styles.fieldRow} key={field.key}>
                      <label
                        className={styles.fieldValue}
                        htmlFor={`${fieldPrefix}-${field.key}`}
                      >
                        {fields.length > 1 && (
                          <span className={styles.fieldLabel}>
                            {field.label}
                          </span>
                        )}
                        {descriptionSource === "manual" ||
                        editingKey === field.key ? (
                          <input
                            id={`${fieldPrefix}-${field.key}`}
                            autoFocus={editingKey === field.key}
                            value={field.value}
                            maxLength={500}
                            aria-label={field.label}
                            placeholder={`Enter ${field.label.toLowerCase()}`}
                            onChange={(event) =>
                              onFieldChange(
                                selected.id,
                                field.key,
                                event.target.value,
                              )
                            }
                            onBlur={() => {
                              onFieldBlur?.(selected.id, field.key);
                              if (descriptionSource !== "manual")
                                setEditingKey(null);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") setEditingKey(null);
                            }}
                          />
                        ) : (
                          <strong>{field.value || "Unknown"}</strong>
                        )}
                        {field.value.trim() && field.source && (
                          <Badge tone="neutral" className={styles.sourceBadge}>
                            {field.source === "visual_inference"
                              ? "AI"
                              : field.source === "catalog"
                                ? "Catalog"
                                : field.source === "user"
                                  ? "You"
                                  : field.source === "sample"
                                    ? "Sample"
                                    : "Note"}
                          </Badge>
                        )}
                      </label>
                      {descriptionSource !== "manual" &&
                        editingKey !== field.key &&
                        field.editable !== false && (
                          <button
                            id={`${fieldPrefix}-${field.key}`}
                            className={styles.editField}
                            type="button"
                            aria-label={`Edit ${field.label}`}
                            onClick={() => setEditingKey(field.key)}
                          >
                            <Icon name="edit" size={16} />
                          </button>
                        )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className={styles.limitation}>
            <Icon name="info" size={16} /> Fabric is described by appearance.
            Exact fiber content needs a label.
          </p>
        </div>
      ) : null}

      {status !== "added" && (
        <footer className={styles.footer}>
          <div className={styles.footerLeft}>
            <Button variant="quiet" onClick={onClose}>
              {" "}
              {hasDraft ? "Keep draft" : "Cancel"}{" "}
            </Button>
            {hasDraft && onDiscardDraft && (
              <Button variant="quiet" onClick={onDiscardDraft} disabled={busy}>
                Discard draft
              </Button>
            )}
          </div>
          {status === "ready" && selected && (
            <Button
              variant="primary"
              disabled={busy || !selected.name.trim()}
              onClick={() => onConfirm(selected.id)}
            >
              {busy ? "Adding item…" : "Add to wardrobe"}
            </Button>
          )}
        </footer>
      )}
    </dialog>
  );
}
