"use client";

import { Chip, Icon } from "@/components/ui";
import { type WardrobeCategory, wardrobeCategories } from "./wardrobe-types";
import styles from "./wardrobe.module.css";

export type WardrobeCategoryTabsProps = {
  activeCategory: WardrobeCategory | "all";
  totalCount: number;
  categoryCounts?: Partial<Record<WardrobeCategory, number>>;
  onCategoryChange: (category: WardrobeCategory | "all") => void;
};

export function WardrobeCategoryTabs({
  activeCategory,
  totalCount,
  categoryCounts,
  onCategoryChange,
}: WardrobeCategoryTabsProps) {
  return (
    <div
      className={styles.categories}
      role="group"
      aria-label="Wardrobe category"
    >
      {wardrobeCategories.map((category) => (
        <button
          className={styles.categoryTab}
          key={category.id}
          type="button"
          aria-pressed={activeCategory === category.id}
          onClick={() => onCategoryChange(category.id)}
        >
          <span className={styles.desktopCategory}>{category.label}</span>
          <span className={styles.mobileCategory}>{category.mobileLabel}</span>
          {category.id === "all" ? (
            <small className={styles.categoryCount}>{totalCount}</small>
          ) : categoryCounts?.[category.id] !== undefined ? (
            <small className={styles.categoryCount}>
              {categoryCounts[category.id]}
            </small>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export type WardrobeFilterControlsProps = {
  inventoryFilter: "owned" | "saved_candidate";
  query: string;
  onFilterChange: (filter: "owned" | "saved_candidate") => void;
  onQueryChange: (query: string) => void;
};

export function WardrobeFilterControls({
  inventoryFilter,
  query,
  onFilterChange,
  onQueryChange,
}: WardrobeFilterControlsProps) {
  return (
    <div className={styles.tools}>
      <label className={styles.search} data-field-surface="">
        <Icon name="search" size={18} />
        <span className={styles.srOnly}>Search wardrobe</span>
        <input
          type="search"
          value={query}
          maxLength={120}
          placeholder="Search by name, color or detail"
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>
      <div
        className={styles.filters}
        role="group"
        aria-label="Inventory status"
      >
        <Chip
          selected={inventoryFilter === "owned"}
          onClick={() => onFilterChange("owned")}
        >
          Owned
        </Chip>
        <Chip
          selected={inventoryFilter === "saved_candidate"}
          onClick={() => onFilterChange("saved_candidate")}
        >
          Saved candidates
        </Chip>
      </div>
    </div>
  );
}
