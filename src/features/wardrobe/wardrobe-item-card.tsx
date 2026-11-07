"use client";

/* eslint-disable @next/next/no-img-element */
import { Badge, Icon } from "@/components/ui";
import {
  type WardrobeItemSummary,
  wardrobeCategoryLabel,
} from "./wardrobe-types";
import styles from "./wardrobe.module.css";

export type WardrobeItemCardProps = {
  item: WardrobeItemSummary;
  onOpen: (itemId: string) => void;
};

export function WardrobeItemCard({ item, onOpen }: WardrobeItemCardProps) {
  return (
    <button
      className={styles.item}
      type="button"
      onClick={() => onOpen(item.id)}
      aria-label={`Open ${item.name}${item.inventoryStatus === "saved_candidate" ? ", saved candidate" : ""}`}
    >
      <span className={styles.itemImage}>
        {item.imageUrl ? (
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
    </button>
  );
}
