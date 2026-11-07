export type WardrobeCategory =
  "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory";

export type InventoryStatus = "owned" | "saved_candidate";

export type WardrobeItemSummary = {
  id: string;
  name: string;
  category: WardrobeCategory;
  subcategory?: string | null;
  imageUrl?: string | null;
  imageKey?: string;
  isSample?: boolean;
  inventoryStatus: InventoryStatus;
  marketplace?: MarketplaceMetadata | null;
};

export type WardrobeField = {
  key: string;
  label: string;
  value: string;
  source?: "user" | "visual_inference" | "catalog" | "derived" | "sample";
  editable?: boolean;
  group?: string;
};

export const wardrobeCategories: ReadonlyArray<{
  id: WardrobeCategory | "all";
  label: string;
  mobileLabel: string;
}> = [
  { id: "all", label: "All", mobileLabel: "All" },
  { id: "top", label: "Tops", mobileLabel: "Tops" },
  { id: "bottom", label: "Bottoms", mobileLabel: "Bottoms" },
  { id: "dress", label: "Dresses and one-pieces", mobileLabel: "Dresses" },
  { id: "outerwear", label: "Outerwear", mobileLabel: "Outerwear" },
  { id: "shoes", label: "Shoes", mobileLabel: "Shoes" },
  { id: "accessory", label: "Accessories", mobileLabel: "Accessories" },
];

export function wardrobeCategoryLabel(category: WardrobeCategory) {
  return (
    wardrobeCategories.find((option) => option.id === category)?.label ??
    category
  );
}
import type { MarketplaceMetadata } from "./catalog";
