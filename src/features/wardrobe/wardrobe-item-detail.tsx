"use client";

import {
  Badge,
  Button,
  ConfirmDialog,
  Icon,
  SelectField,
} from "@/components/ui";
import { WardrobePreviewImage } from "./wardrobe-intake-storage";
import {
  type WardrobeCategory,
  type WardrobeField,
  type WardrobeItemSummary,
  wardrobeCategories,
  wardrobeCategoryLabel,
} from "./wardrobe-types";
import styles from "./wardrobe-detail.module.css";

export type WardrobeItemDetailData = WardrobeItemSummary & {
  fields: WardrobeField[];
  sourceName?: string | null;
  priceWhenSaved?: string | null;
  usedIn?: Array<{ id: string; title: string; imageUrls: string[] }>;
};

export type WardrobeItemDetailProps = {
  item: WardrobeItemDetailData;
  onMarkOwned?: () => void;
  onPreview?: () => void;
  onDelete?: () => void;
  onSave?: () => void;
  onNameChange?: (name: string) => void;
  onCategoryChange?: (category: WardrobeCategory) => void;
  onSubcategoryChange?: (subcategory: string) => void;
  onFieldChange?: (key: string, value: string) => void;
  onFieldBlur?: (key: string) => void;
  onUseOriginal?: (key: string) => void;
  correctedFields?: string[];
  originalReadings?: string[];
  onBack: () => void;
  onOpenSavedLook?: (lookId: string) => void;
  saveDisabled?: boolean;
  busy?: boolean;
};

function sourceLabel(source?: WardrobeField["source"]) {
  switch (source) {
    case "visual_inference":
      return "AI";
    case "catalog":
      return "Catalog";
    case "user":
      return "You";
    case "sample":
      return "Sample";
    case "derived":
      return "Derived";
    default:
      return null;
  }
}

export function WardrobeItemDetail({
  item,
  onMarkOwned,
  onPreview,
  onDelete,
  onSave,
  onNameChange,
  onCategoryChange,
  onSubcategoryChange,
  onFieldChange,
  onFieldBlur,
  onUseOriginal,
  correctedFields = [],
  originalReadings = [],
  onBack,
  onOpenSavedLook,
  saveDisabled = false,
  busy = false,
}: WardrobeItemDetailProps) {
  return (
    <article className={styles.detail} aria-labelledby="wardrobe-item-title">
      <div className={styles.breadcrumb}>
        Wardrobe <span aria-hidden="true">›</span> {item.name}
      </div>
      <div className={styles.columns}>
        <div className={styles.mediaColumn}>
          <div className={styles.heroImage}>
            <WardrobePreviewImage
              imageKey={item.imageKey}
              fallbackUrl={item.imageUrl}
              alt={item.name}
              retryable
            />
          </div>
          {onPreview && (
            <div className={styles.mediaActions}>
              <Button variant="quiet" onClick={onPreview}>
                Preview on avatar
              </Button>
            </div>
          )}
        </div>
        <div className={styles.infoColumn}>
          {item.inventoryStatus === "saved_candidate" && (
            <div className={styles.candidateBanner}>
              <Icon name="bookmark" />
              <div>
                <strong>
                  Saved candidate
                  {item.sourceName ? ` from ${item.sourceName}` : ""}
                </strong>
                <p>Mark it owned to use it in matches and capsules.</p>
              </div>
              {onMarkOwned && (
                <Button variant="primary" disabled={busy} onClick={onMarkOwned}>
                  Mark as owned
                </Button>
              )}
            </div>
          )}
          {item.isSample && <Badge tone="neutral">Sample item</Badge>}
          <h1 id="wardrobe-item-title" aria-label={item.name}>
            {onNameChange ? (
              <label className={styles.nameField} data-field-surface="">
                <span className={styles.srOnly}>Item name</span>
                <input
                  aria-label="Item name"
                  value={item.name}
                  maxLength={160}
                  disabled={busy}
                  onChange={(event) => onNameChange(event.target.value)}
                />
              </label>
            ) : (
              item.name
            )}
          </h1>
          {onCategoryChange ? (
            <div className={styles.identityFields}>
              <SelectField
                label="Category"
                value={item.category}
                disabled={busy}
                onChange={(event) =>
                  onCategoryChange(event.target.value as WardrobeCategory)
                }
              >
                {wardrobeCategories
                  .filter((category) => category.id !== "all")
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
              </SelectField>
              <label className={styles.attribute} data-field-surface="">
                <span className={styles.fieldLabel}>Subcategory</span>
                <input
                  value={item.subcategory ?? ""}
                  maxLength={120}
                  disabled={busy}
                  onChange={(event) =>
                    onSubcategoryChange?.(event.target.value)
                  }
                  placeholder="Enter subcategory"
                />
              </label>
            </div>
          ) : (
            <p className={styles.subtitle}>
              {wardrobeCategoryLabel(item.category)}
              {item.subcategory ? `, ${item.subcategory}` : ""}
            </p>
          )}
          <div className={styles.attributeGrid}>
            {item.fields.map((field) => (
              <div
                className={`${styles.attribute} ${onFieldChange ? styles.editableAttribute : ""}`}
                data-field-surface={onFieldChange ? "" : undefined}
                key={field.key}
              >
                <label
                  className={styles.attributeLabel}
                  htmlFor={
                    onFieldChange ? `wardrobe-detail-${field.key}` : undefined
                  }
                >
                  <span className={styles.fieldLabel}>
                    {field.label}{" "}
                    {sourceLabel(field.source) && (
                      <span>{sourceLabel(field.source)}</span>
                    )}
                  </span>
                  {onFieldChange ? (
                    field.key === "description" || field.key === "notes" ? (
                      <textarea
                        id={`wardrobe-detail-${field.key}`}
                        aria-label={field.label}
                        value={field.value}
                        disabled={busy}
                        rows={field.key === "notes" ? 3 : 4}
                        maxLength={field.key === "notes" ? 4000 : 600}
                        onChange={(event) =>
                          onFieldChange(field.key, event.target.value)
                        }
                        onBlur={() => onFieldBlur?.(field.key)}
                        placeholder={`Enter ${field.label.toLowerCase()}`}
                      />
                    ) : (
                      <input
                        id={`wardrobe-detail-${field.key}`}
                        aria-label={field.label}
                        value={field.value}
                        disabled={busy}
                        maxLength={
                          field.label.includes("comma separated") ? 500 : 120
                        }
                        onChange={(event) =>
                          onFieldChange(field.key, event.target.value)
                        }
                        onBlur={() => onFieldBlur?.(field.key)}
                        placeholder={`Enter ${field.label.toLowerCase()}`}
                      />
                    )
                  ) : (
                    <span className={styles.fieldValue}>
                      {field.value || "Unknown"}
                    </span>
                  )}
                </label>
                {onUseOriginal && correctedFields.includes(field.key) && (
                  <Button
                    variant="quiet"
                    disabled={busy || originalReadings.includes(field.key)}
                    onClick={() => onUseOriginal(field.key)}
                  >
                    {originalReadings.includes(field.key)
                      ? "Original reading selected"
                      : "Use original reading"}
                  </Button>
                )}
              </div>
            ))}
            {item.priceWhenSaved && (
              <div className={styles.attribute}>
                <span className={styles.fieldLabel}>
                  Price when saved <span>Catalog</span>
                </span>
                <span className={styles.fieldValue}>{item.priceWhenSaved}</span>
              </div>
            )}
            {item.sourceName && (
              <div className={styles.attribute}>
                <span className={styles.fieldLabel}>
                  Source <span>Catalog</span>
                </span>
                <span className={styles.fieldValue}>{item.sourceName}</span>
              </div>
            )}
          </div>
          {item.usedIn && item.usedIn.length > 0 && (
            <div className={styles.usedIn}>
              <h2>Used in</h2>
              {item.usedIn.map((look) => (
                <button
                  key={look.id}
                  className={styles.usedInLook}
                  type="button"
                  onClick={() => onOpenSavedLook?.(look.id)}
                  disabled={!onOpenSavedLook}
                >
                  <span className={styles.lookImages}>
                    {look.imageUrls.slice(0, 3).map((url, index) => (
                      <WardrobePreviewImage
                        key={`${url}-${index}`}
                        fallbackUrl={url}
                        alt=""
                      />
                    ))}
                  </span>
                  <span>{look.title}</span>
                </button>
              ))}
            </div>
          )}
          <div className={styles.detailActions}>
            {onDelete && (
              <Button variant="quiet" onClick={onDelete} disabled={busy}>
                <Icon name="trash" size={16} /> Delete item
              </Button>
            )}
            {onSave && (
              <Button
                variant="primary"
                onClick={onSave}
                disabled={busy || saveDisabled}
                aria-busy={busy}
              >
                {busy ? "Saving…" : "Save changes"}
              </Button>
            )}
          </div>
        </div>
      </div>
      <Button variant="quiet" className={styles.back} onClick={onBack}>
        <Icon name="arrow-left" size={16} /> Back to wardrobe
      </Button>
    </article>
  );
}

export type WardrobeDeleteDialogProps = {
  open: boolean;
  itemName: string;
  itemImageUrl?: string | null;
  itemImageKey?: string;
  busy?: boolean;
  errorMessage?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function WardrobeDeleteDialog({
  open,
  itemName,
  itemImageUrl,
  itemImageKey,
  busy = false,
  errorMessage,
  onCancel,
  onConfirm,
}: WardrobeDeleteDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      busy={busy}
      title={
        <span className={styles.deleteTitle}>
          {(itemImageUrl || itemImageKey) && (
            <span aria-hidden="true">
              <WardrobePreviewImage
                imageKey={itemImageKey}
                fallbackUrl={itemImageUrl}
                alt=""
              />
            </span>
          )}
          Delete {itemName}?
        </span>
      }
      description="This permanently removes the item from the wardrobe. Saved looks keep their saved photo and description."
      cancelLabel="Keep item"
      confirmLabel={busy ? "Deleting…" : "Delete item"}
      onClose={onCancel}
      onConfirm={onConfirm}
    >
      {errorMessage && (
        <p role="alert" className={styles.deleteError}>
          {errorMessage}
        </p>
      )}
    </ConfirmDialog>
  );
}
