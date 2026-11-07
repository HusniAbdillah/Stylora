"use client";

/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import { Badge, Icon } from "@/components/ui";
import { marketplacePrice } from "./catalog";
import {
  type WardrobeItemSummary,
  wardrobeCategoryLabel,
} from "./wardrobe-types";
import styles from "./wardrobe.module.css";

export type WardrobeItemCardProps = {
  item: WardrobeItemSummary;
  onOpen: (itemId: string) => void;
  renderImage?: (item: WardrobeItemSummary) => ReactNode;
};

export function WardrobeItemCard({
  item,
  onOpen,
  renderImage,
}: WardrobeItemCardProps) {
  return (
    <button
      className={styles.item}
      type="button"
      onClick={() => onOpen(item.id)}
      aria-label={`Open ${item.name}${item.inventoryStatus === "saved_candidate" ? ", saved candidate" : ""}${item.isSample ? ", sample item" : ""}`}
    >
      <span className={styles.itemImage}>
        {renderImage ? (
          renderImage(item)
        ) : item.imageUrl ? (
          <img src={item.imageUrl} alt="" />
        ) : (
          <span className={styles.imageFallback}>
            <Icon name="image" size={28} /> Image unavailable
          </span>
        )}
        {item.inventoryStatus === "saved_candidate" && (
          <Badge tone="neutral" className={styles.candidateBadge}>
            <Icon name="bookmark" size={12} />
            <span className={styles.candidateLong}>
              Saved candidate, not owned
            </span>
            <span className={styles.candidateShort}>Candidate</span>
          </Badge>
        )}
      </span>
      <strong className={styles.itemName}>{item.name}</strong>
      <span className={styles.itemCategory}>
        {wardrobeCategoryLabel(item.category)}
      </span>
      {item.isSample && <span className={styles.sampleLabel}>Sample item</span>}
      {item.marketplace && (
        <span className="mt-1 block text-xs text-secondary">
          {marketplacePrice(item.marketplace)}
          {item.marketplace.rating !== null
            ? ` · ${item.marketplace.rating}/5`
            : ""}
        </span>
      )}
    </button>
  );
}
