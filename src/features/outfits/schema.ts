import { z } from "zod";
import {
  categorySchema,
  explanationSchema,
  garmentSchema,
} from "@/lib/ai/fashion-schema";
import {
  itemConstraintConflict,
  isOwnedInventoryItem,
  type InventoryMode,
  type MatchItem,
} from "@/features/matching/gates";

export const optionTypeSchema = z.enum([
  "closest",
  "from_wardrobe",
  "fresh_alternative",
]);
export const missingBriefSchema = garmentSchema.safeExtend({
  schemaVersion: z.literal("fashion-item.v1"),
});
export const outfitItemSchema = z.strictObject({
  slotId: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  category: categorySchema,
  itemKind: z.enum(["owned", "missing"]),
  pieceId: z.uuid().nullable(),
  wardrobeItemId: z.uuid().nullable(),
  missingBrief: missingBriefSchema.nullable(),
  rationale: z.string().min(1).max(600),
});
export const outfitOptionSchema = z.strictObject({
  optionType: optionTypeSchema,
  title: z.string().min(1).max(160),
  concept: z.string().min(1).max(600),
  status: z.enum(["ready", "unavailable"]),
  explanation: explanationSchema,
  items: z.array(outfitItemSchema).max(12),
});
export const outfitOptionsSchema = z.strictObject({
  options: z.array(outfitOptionSchema).min(1).max(3),
});
export type OutfitOption = z.infer<typeof outfitOptionSchema>;
export type OutfitOptionType = z.infer<typeof optionTypeSchema>;

export function wardrobeSupportsOutfit(
  pieces: MatchItem[],
  inventory: MatchItem[],
  constraints: {
    preferences: Record<string, string | string[]>;
    occasion: string | null;
    inventoryMode?: InventoryMode;
  },
) {
  const categories = new Set(
    inventory
      .filter(
        (item) =>
          isOwnedInventoryItem(item, constraints.inventoryMode) &&
          !itemConstraintConflict(
            item,
            constraints.preferences,
            constraints.occasion,
          ),
      )
      .map((item) => item.category),
  );
  return (
    (categories.has("dress") ||
      (categories.has("top") && categories.has("bottom"))) &&
    (!pieces.some((piece) => piece.category === "shoes") ||
      categories.has("shoes"))
  );
}

export function validateOptionComposition(
  options: OutfitOption[],
  pieces: MatchItem[],
  inventory: MatchItem[],
  requestedType?: OutfitOptionType,
  constraints: {
    preferences: Record<string, string | string[]>;
    occasion: string | null;
    inventoryMode?: InventoryMode;
  } = { preferences: {}, occasion: null },
) {
  const errors: string[] = [];
  const expectedTypes = requestedType
    ? [requestedType]
    : optionTypeSchema.options;
  if (
    options.length !== expectedTypes.length ||
    expectedTypes.some(
      (type) =>
        options.filter((option) => option.optionType === type).length !== 1,
    )
  )
    errors.push("option_types_invalid");
  const inventoryIds = new Map(inventory.map((item) => [item.id, item]));
  const pieceIds = new Map(pieces.map((piece) => [piece.id, piece]));
  const inventorySupportsOutfit = wardrobeSupportsOutfit(
    pieces,
    inventory,
    constraints,
  );
  const compositions = new Set<string>();
  for (const option of options) {
    if (option.status === "unavailable") {
      if (option.optionType !== "from_wardrobe" || option.items.length)
        errors.push("unavailable_option_invalid");
      if (inventorySupportsOutfit)
        errors.push("wardrobe_direction_incorrectly_unavailable");
      continue;
    }
    const slots = new Set<string>();
    const selectedOwned = new Set<string>();
    const categories = new Set(option.items.map((item) => item.category));
    if (
      !categories.has("dress") &&
      !(categories.has("top") && categories.has("bottom"))
    )
      errors.push("incomplete_clothing_coverage");
    if (
      pieces.some((piece) => piece.category === "shoes") &&
      !categories.has("shoes")
    )
      errors.push("missing_footwear_role");
    if (categories.has("dress") && categories.has("bottom"))
      errors.push("conflicting_one_piece_and_bottom");
    for (const item of option.items) {
      if (slots.has(item.slotId)) errors.push("duplicate_slot");
      slots.add(item.slotId);
      if (
        item.pieceId &&
        (!pieceIds.has(item.pieceId) ||
          pieceIds.get(item.pieceId)?.category !== item.category)
      )
        errors.push("invalid_piece_reference");
      if (item.itemKind === "owned") {
        const owned = item.wardrobeItemId
          ? inventoryIds.get(item.wardrobeItemId)
          : null;
        if (
          !owned ||
          !isOwnedInventoryItem(owned, constraints.inventoryMode) ||
          owned.category !== item.category ||
          item.missingBrief !== null
        )
          errors.push("invalid_owned_reference");
        if (item.wardrobeItemId && selectedOwned.has(item.wardrobeItemId))
          errors.push("duplicate_physical_item");
        if (item.wardrobeItemId) selectedOwned.add(item.wardrobeItemId);
        if (
          owned &&
          itemConstraintConflict(
            owned,
            constraints.preferences,
            constraints.occasion,
          )
        )
          errors.push("practical_constraint_contradiction");
      } else if (
        item.wardrobeItemId !== null ||
        !item.missingBrief ||
        item.missingBrief.category !== item.category
      )
        errors.push("invalid_missing_brief");
      if (
        item.itemKind === "missing" &&
        item.missingBrief &&
        itemConstraintConflict(
          {
            ...item.missingBrief,
            id: item.slotId,
            sourceType: "live",
            revision: 1,
          },
          constraints.preferences,
          constraints.occasion,
        )
      )
        errors.push("practical_constraint_contradiction");
      if (option.optionType === "from_wardrobe" && item.itemKind !== "owned")
        errors.push("wardrobe_direction_contains_missing");
    }
    const composition = option.items
      .map((item) =>
        item.itemKind === "owned"
          ? `owned:${item.wardrobeItemId}`
          : `missing:${item.category}:${JSON.stringify(
              Object.fromEntries(
                Object.entries(item.missingBrief?.attributes ?? {})
                  .filter(([, value]) => value !== null && value !== undefined)
                  .map(([key, value]) => [
                    key,
                    Array.isArray(value)
                      ? [...value].sort()
                      : typeof value === "string"
                        ? value.toLowerCase()
                        : value,
                  ])
                  .sort(([left], [right]) =>
                    String(left).localeCompare(String(right)),
                  ),
              ),
            )}`,
      )
      .sort()
      .join("|");
    if (compositions.has(composition)) errors.push("duplicate_composition");
    compositions.add(composition);
  }
  return [...new Set(errors)];
}
