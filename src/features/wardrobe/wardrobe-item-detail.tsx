"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef } from "react";
import { Badge, Button, Icon } from "@/components/ui";
import {
  type WardrobeField,
  type WardrobeItemSummary,
  wardrobeCategoryLabel,
} from "./wardrobe-types";
import styles from "./wardrobe-detail.module.css";

export type WardrobeItemDetailData = WardrobeItemSummary & {
  fields: WardrobeField[];
  sourceName?: string | null;
  priceWhenSaved?: string | null;
  archived?: boolean;
  usedIn?: Array<{ id: string; title: string; imageUrls: string[] }>;
};

export type WardrobeItemDetailProps = {
  item: WardrobeItemDetailData;
  onMarkOwned?: () => void;
  onReplacePhoto?: () => void;
  onPreview?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onEdit?: () => void;
  onBack: () => void;
  onOpenSavedLook?: (lookId: string) => void;
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
  onReplacePhoto,
  onPreview,
  onArchive,
  onRestore,
  onEdit,
  onBack,
  onOpenSavedLook,
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
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.name} />
            ) : (
              <span className={styles.imageFallback}>
                <Icon name="image" size={32} /> Image unavailable
              </span>
            )}
          </div>
          <div className={styles.mediaActions}>
            {onReplacePhoto && (
              <Button variant="secondary" onClick={onReplacePhoto}>
                Replace photo
              </Button>
            )}
            {onPreview && (
              <Button variant="quiet" onClick={onPreview}>
                Preview on avatar
              </Button>
            )}
          </div>
        </div>
        <div className={styles.infoColumn}>
          {item.inventoryStatus === "saved_candidate" && !item.archived && (
            <div className={styles.candidateBanner}>
              <Icon name="bookmark" />
              <div>
                <strong>
                  Saved candidate
                  {item.sourceName ? ` from ${item.sourceName}` : ""}, not owned
                </strong>
                <p>
                  It will not be used in matches or capsules until you mark it
                  owned.
                </p>
              </div>
              {onMarkOwned && (
                <Button variant="primary" disabled={busy} onClick={onMarkOwned}>
                  Mark as owned
                </Button>
              )}
            </div>
          )}
          {item.archived && <Badge tone="neutral">Archived item</Badge>}
          <h1 id="wardrobe-item-title">{item.name}</h1>
          <p className={styles.subtitle}>
            {wardrobeCategoryLabel(item.category)}
            {item.subcategory ? `, ${item.subcategory}` : ""}
          </p>
          <dl className={styles.attributeGrid}>
            {item.fields.map((field) => (
              <div className={styles.attribute} key={field.key}>
                <dt>
                  {field.label}{" "}
                  {sourceLabel(field.source) && (
                    <span>{sourceLabel(field.source)}</span>
                  )}
                </dt>
                <dd>{field.value || "Unknown"}</dd>
              </div>
            ))}
            {item.priceWhenSaved && (
              <div className={styles.attribute}>
                <dt>
                  Price when saved <span>Catalog</span>
                </dt>
                <dd>{item.priceWhenSaved}</dd>
              </div>
            )}
            {item.sourceName && (
              <div className={styles.attribute}>
                <dt>
                  Source <span>Catalog</span>
                </dt>
                <dd>{item.sourceName}</dd>
              </div>
            )}
          </dl>
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
                      <img key={`${url}-${index}`} src={url} alt="" />
                    ))}
                  </span>
                  <span>{look.title}</span>
                </button>
              ))}
            </div>
          )}
          <div className={styles.detailActions}>
            {item.archived
              ? onRestore && (
                  <Button variant="quiet" onClick={onRestore}>
                    Restore item
                  </Button>
                )
              : onArchive && (
                  <Button variant="quiet" onClick={onArchive}>
                    <Icon name="trash" size={16} /> Archive item
                  </Button>
                )}
            {onEdit && (
              <Button variant="secondary" onClick={onEdit}>
                Edit details
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

export type WardrobeArchiveDialogProps = {
  open: boolean;
  itemName: string;
  itemImageUrl?: string | null;
  savedLookCount?: number;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function WardrobeArchiveDialog({
  open,
  itemName,
  itemImageUrl,
  savedLookCount = 0,
  busy = false,
  onCancel,
  onConfirm,
}: WardrobeArchiveDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>("[data-safe-action]")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      restoreFocusRef.current?.focus();
    }
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.archiveDialog}
      aria-labelledby="wardrobe-archive-title"
      aria-describedby="wardrobe-archive-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className={styles.archiveTitle}>
        {itemImageUrl && <img src={itemImageUrl} alt="" />}
        <h2 id="wardrobe-archive-title">Archive {itemName}?</h2>
      </div>
      <p id="wardrobe-archive-description">
        It leaves your active wardrobe and will not appear in new matches,
        capsules or previews.
      </p>
      <ul className={styles.archiveConsequences}>
        <li>
          <Icon name="check" size={14} /> {savedLookCount} saved{" "}
          {savedLookCount === 1 ? "look keeps" : "looks keep"} its original
          photo and description
        </li>
        <li>
          <Icon name="check" size={14} /> You can restore it from Archived items
        </li>
        <li>
          <Icon name="info" size={14} /> Current outfit ideas that use it will
          refresh
        </li>
      </ul>
      <div className={styles.archiveActions}>
        <Button variant="secondary" data-safe-action onClick={onCancel}>
          Keep item
        </Button>
        <Button variant="primary" disabled={busy} onClick={onConfirm}>
          {busy ? "Archiving…" : "Archive item"}
        </Button>
      </div>
    </dialog>
  );
}
