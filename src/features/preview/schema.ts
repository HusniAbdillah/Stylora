import { z } from "zod";
import type { PreviewItem } from "./preview-studio";

export const previewSelectionSchema = z
  .strictObject({
    top: z.uuid().optional(),
    bottom: z.uuid().optional(),
    dress: z.uuid().optional(),
    outerwear: z.uuid().optional(),
    shoes: z.uuid().optional(),
    bags: z.uuid().optional(),
    accessories: z.uuid().optional(),
  })
  .refine(
    (selection) =>
      new Set(Object.values(selection)).size ===
      Object.values(selection).length,
    "Choose each piece only once.",
  );

export const previewDraftInput = z.strictObject({
  draftId: z.uuid().nullable(),
  revision: z.number().int().nonnegative(),
  selection: previewSelectionSchema,
});

export function slotForPreviewItem(
  item: Pick<PreviewItem, "category" | "subcategory">,
) {
  if (item.category !== "accessory") return item.category;
  return /bag|tote|clutch|backpack|handbag/i.test(item.subcategory ?? "")
    ? "bags"
    : "accessories";
}

export function validatePreviewSelection(
  selection: z.infer<typeof previewSelectionSchema>,
  items: PreviewItem[],
) {
  return Object.entries(selection).every(([slot, id]) =>
    items.some(
      (item) =>
        item.id === id &&
        item.inventoryStatus === "owned" &&
        slotForPreviewItem(item) === slot,
    ),
  );
}
