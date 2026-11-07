"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Icon } from "@/components/ui";
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
  fields: WardrobeField[];
};

export type WardrobeIntakeProps = {
  open: boolean;
  status: "empty" | "uploading" | "analyzing" | "ready" | "error";
  proposals: WardrobeProposal[];
  selectedProposalId?: string;
  errorMessage?: string;
  onClose: () => void;
  onPickImage: (file: File) => void;
  onSelectProposal: (id: string) => void;
  onNameChange: (id: string, name: string) => void;
  onCategoryChange: (id: string, category: WardrobeCategory) => void;
  onFieldChange: (id: string, key: string, value: string) => void;
  onConfirm: (id: string) => void;
  onRetry?: () => void;
  onManualEntry?: () => void;
  busy?: boolean;
};

export function WardrobeIntake({
  open,
  status,
  proposals,
  selectedProposalId,
  errorMessage,
  onClose,
  onPickImage,
  onSelectProposal,
  onNameChange,
  onCategoryChange,
  onFieldChange,
  onConfirm,
  onRetry,
  onManualEntry,
  busy = false,
}: WardrobeIntakeProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
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
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPickImage(file);
          event.target.value = "";
        }}
      />

      {status === "empty" ? (
        <div className={styles.uploadPrompt}>
          <span className={styles.uploadIcon}>
            <Icon name="upload" size={26} />
          </span>
          <h3>Start with one photo</h3>
          <p>
            Choose a clear image of the piece. We will suggest a description for
            you to review.
          </p>
          <Button variant="primary" onClick={chooseFile}>
            Choose photo
          </Button>
          <small>
            JPEG, PNG or WebP. Your photo is checked before analysis.
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
              ? "Uploading your photo"
              : "Describing the piece"}
          </h3>
          <p>
            {status === "uploading"
              ? "We are checking the image before reading it."
              : "Keep this open or come back later. Your uploaded draft is saved."}
          </p>
          <div className={styles.progressBar} aria-hidden="true">
            <span />
          </div>
        </div>
      ) : status === "error" ? (
        <div className={styles.error} role="alert">
          <Icon name="info" size={32} />
          <h3>Photo description is unavailable</h3>
          <p>
            {errorMessage ??
              "The photo is saved as a draft. Try again or enter the details yourself."}
          </p>
          <div className={styles.errorActions}>
            {onRetry && (
              <Button variant="primary" onClick={onRetry}>
                Retry description
              </Button>
            )}
            {onManualEntry && (
              <Button variant="secondary" onClick={onManualEntry}>
                Enter details manually
              </Button>
            )}
          </div>
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
              {selected.imageUrl ? (
                <img src={selected.imageUrl} alt="Uploaded wardrobe item" />
              ) : (
                <Icon name="image" size={32} />
              )}
            </div>
            <div className={styles.summaryText}>
              <Badge tone="owned">Photo read</Badge>
              <label className={styles.nameLabel}>
                <span className={styles.srOnly}>Item name</span>
                <input
                  value={selected.name}
                  onChange={(event) =>
                    onNameChange(selected.id, event.target.value)
                  }
                  aria-label="Item name"
                />
              </label>
              <p>
                Check the details, then add it. You can change anything later.
              </p>
              <Button variant="secondary" onClick={chooseFile}>
                Replace photo
              </Button>
            </div>
          </div>
          <div className={styles.fields}>
            <label className={styles.categoryField}>
              <span>Category</span>
              <select
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
              </select>
            </label>
            {selected.fields.map((field) => (
              <div className={styles.field} key={field.key}>
                <div className={styles.fieldText}>
                  <span className={styles.fieldLabel}>{field.label}</span>
                  {editingKey === field.key ? (
                    <input
                      autoFocus
                      value={field.value}
                      aria-label={field.label}
                      onChange={(event) =>
                        onFieldChange(
                          selected.id,
                          field.key,
                          event.target.value,
                        )
                      }
                      onBlur={() => setEditingKey(null)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") setEditingKey(null);
                      }}
                    />
                  ) : (
                    <strong>{field.value || "Unknown"}</strong>
                  )}
                </div>
                {field.source && (
                  <Badge tone="neutral" className={styles.sourceBadge}>
                    {field.source === "visual_inference"
                      ? "AI"
                      : field.source === "catalog"
                        ? "Catalog"
                        : field.source === "user"
                          ? "You"
                          : "Note"}
                  </Badge>
                )}
                {field.editable !== false && (
                  <button
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
          <p className={styles.limitation}>
            <Icon name="info" size={16} /> Fabric is described by appearance.
            Exact fiber content needs a label.
          </p>
        </div>
      ) : null}

      <footer className={styles.footer}>
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
        {status === "ready" && selected && (
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => onConfirm(selected.id)}
          >
            {busy ? "Adding item…" : "Add to wardrobe"}
          </Button>
        )}
      </footer>
    </dialog>
  );
}
