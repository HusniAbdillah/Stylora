"use client";

import { Button, Icon } from "@/components/ui";
import {
  WardrobeCategoryTabs,
  WardrobeFilterControls,
} from "./wardrobe-controls";
import { WardrobeEmptyState } from "./wardrobe-empty-state";
import { WardrobeItemCard } from "./wardrobe-item-card";
import {
  type WardrobeCategory,
  type WardrobeItemSummary,
} from "./wardrobe-types";
import styles from "./wardrobe.module.css";

export type WardrobeGridProps = {
  items: WardrobeItemSummary[];
  totalCount: number;
  categoryCounts?: Partial<Record<WardrobeCategory, number>>;
  activeCategory: WardrobeCategory | "all";
  inventoryFilter: "owned" | "saved_candidate";
  query: string;
  status?: "ready" | "loading" | "error";
  errorMessage?: string;
  onCategoryChange: (category: WardrobeCategory | "all") => void;
  onFilterChange: (filter: "owned" | "saved_candidate") => void;
  onQueryChange: (query: string) => void;
  onAddItem: () => void;
  onOpenItem: (itemId: string) => void;
  onRetry?: () => void;
  onUseSample?: () => void;
};

export function WardrobeGrid({
  items,
  totalCount,
  categoryCounts,
  activeCategory,
  inventoryFilter,
  query,
  status = "ready",
  errorMessage,
  onCategoryChange,
  onFilterChange,
  onQueryChange,
  onAddItem,
  onOpenItem,
  onRetry,
  onUseSample,
}: WardrobeGridProps) {
  const showInitialEmpty = status === "ready" && totalCount === 0 && !query;

  return (
    <section className={styles.wardrobe} aria-labelledby="wardrobe-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Your wardrobe</p>
          <h1 className={styles.title} id="wardrobe-title">
            Everything you <em>own.</em>
          </h1>
          <p className={styles.intro}>
            Only owned pieces are used for matches, outfit ideas and capsules.
            Saved shopping candidates stay labeled until you mark them owned.
          </p>
        </div>
        <div className={styles.headerAction}>
          <Button
            variant="primary"
            className={styles.headerButton}
            aria-label="Add item"
            onClick={onAddItem}
          >
            <span className={styles.desktopAction}>Add item</span>
            <span className={styles.mobileAction}>
              <Icon name="plus" />
            </span>
          </Button>
          <span className={styles.actionHint}>
            <Icon name="sparkle" size={14} /> One photo is enough
          </span>
        </div>
      </header>

      {showInitialEmpty ? (
        <WardrobeEmptyState onAddItem={onAddItem} onUseSample={onUseSample} />
      ) : (
        <>
          <WardrobeCategoryTabs
            activeCategory={activeCategory}
            totalCount={totalCount}
            categoryCounts={categoryCounts}
            onCategoryChange={onCategoryChange}
          />

          <WardrobeFilterControls
            inventoryFilter={inventoryFilter}
            query={query}
            onFilterChange={onFilterChange}
            onQueryChange={onQueryChange}
          />

          {status === "error" ? (
            <div className={styles.messageCard} role="alert">
              <Icon name="info" />
              <div>
                <strong>Wardrobe is unavailable</strong>
                <p>
                  {errorMessage ??
                    "We could not load these items. Your saved wardrobe is unchanged."}
                </p>
              </div>
              {onRetry && (
                <Button variant="secondary" onClick={onRetry}>
                  Retry
                </Button>
              )}
            </div>
          ) : status === "loading" ? (
            <div
              className={styles.grid}
              aria-busy="true"
              aria-label="Loading wardrobe items"
            >
              {Array.from({ length: 8 }, (_, index) => (
                <div className={styles.skeletonItem} key={index}>
                  <div className={styles.skeletonImage} />
                  <div className={styles.skeletonLine} />
                  <div className={styles.skeletonLineShort} />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className={styles.messageCard} role="status">
              <Icon name="search" />
              <div>
                <strong>No pieces found</strong>
                <p>
                  Try another category, filter or search. Your wardrobe items
                  are still here.
                </p>
              </div>
            </div>
          ) : (
            <div className={styles.grid}>
              <button
                className={styles.addTile}
                onClick={onAddItem}
                type="button"
              >
                <span className={styles.addTileIcon}>
                  <Icon name="upload" size={24} />
                </span>
                <strong>Add with one photo</strong>
                <span>AI writes the description</span>
              </button>
              {items.map((item) => (
                <WardrobeItemCard
                  key={item.id}
                  item={item}
                  onOpen={onOpenItem}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
