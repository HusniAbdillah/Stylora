import type { CanonicalWardrobeItem } from "./schema";
import type { WardrobeItemSummary } from "./wardrobe-types";

export type WardrobeCollectionItem = WardrobeItemSummary & {
  searchText: string;
};
type CollectionSource = Pick<
  CanonicalWardrobeItem,
  | "id"
  | "name"
  | "category"
  | "subcategory"
  | "description"
  | "attributes"
  | "notes"
  | "sourceType"
  | "inventoryStatus"
  | "imageUrl"
> &
  Pick<WardrobeItemSummary, "imageKey" | "marketplace">;

export function toWardrobeCollectionItem(
  item: CollectionSource,
): WardrobeCollectionItem {
  const fields = {
    description: item.description,
    ...item.attributes,
    notes: item.notes,
  };
  const searchText = [
    item.name,
    item.subcategory ?? "",
    ...Object.entries(fields).flatMap(([key, value]) => [
      key
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/^./, (letter) => letter.toUpperCase()) +
        (Array.isArray(value) ? " (comma separated)" : ""),
      Array.isArray(value) ? value.join(", ") : String(value ?? ""),
    ]),
  ]
    .join(" ")
    .toLocaleLowerCase();
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    subcategory: item.subcategory,
    imageUrl: item.imageUrl,
    imageKey: item.imageKey,
    isSample: item.sourceType === "sample",
    inventoryStatus: item.inventoryStatus,
    marketplace: item.marketplace,
    searchText,
  };
}

export function matchesWardrobeCollectionQuery(
  item: WardrobeCollectionItem,
  query: string,
) {
  return item.searchText.includes(query.trim().toLocaleLowerCase());
}
