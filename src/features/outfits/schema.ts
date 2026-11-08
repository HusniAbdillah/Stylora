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
export const ABSENT_PREFERENCES_GUIDANCE =
  "These ideas use the reference's colors and silhouette. Add your preferences for more personal color and fit guidance.";
type OutfitConstraints = {
  preferences: Record<string, string | string[]>;
  occasion: string | null;
  inventoryMode?: InventoryMode;
};

export function hasSuppliedPreferences(
  preferences: Record<string, string | string[]>,
) {
  return Object.values(preferences).some((value) =>
    Array.isArray(value)
      ? value.some((entry) => entry.trim().length > 0)
      : value.trim().length > 0,
  );
}

export function eligibleOwnedOutfitItems(
  inventory: MatchItem[],
  constraints: OutfitConstraints,
) {
  return inventory.filter(
    (item) =>
      isOwnedInventoryItem(item, constraints.inventoryMode) &&
      !itemConstraintConflict(
        item,
        constraints.preferences,
        constraints.occasion,
      ),
  );
}

export function wardrobeSupportsOutfit(
  pieces: MatchItem[],
  inventory: MatchItem[],
  constraints: OutfitConstraints,
) {
  const categories = new Set(
    eligibleOwnedOutfitItems(inventory, constraints).map(
      (item) => item.category,
    ),
  );
  return (
    (categories.has("dress") ||
      (categories.has("top") && categories.has("bottom"))) &&
    (!pieces.some((piece) => piece.category === "shoes") ||
      categories.has("shoes"))
  );
}

export function optionCompositionIssues(
  options: OutfitOption[],
  pieces: MatchItem[],
  inventory: MatchItem[],
  requestedType?: OutfitOptionType,
  constraints: OutfitConstraints = { preferences: {}, occasion: null },
) {
  const issues: { code: string; path: string }[] = [];
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
    issues.push({ code: "option_types_invalid", path: "options" });
  const inventoryIds = new Map(inventory.map((item) => [item.id, item]));
  const pieceIds = new Map(pieces.map((piece) => [piece.id, piece]));
  const inventorySupportsOutfit = wardrobeSupportsOutfit(
    pieces,
    inventory,
    constraints,
  );
  const compositions = new Set<string>();
  const suppliedPreferences = hasSuppliedPreferences(constraints.preferences);
  for (const option of options) {
    const path = `options.${option.optionType}`;
    const issue = (code: string, field: string) =>
      issues.push({ code, path: `${path}.${field}` });
    if (
      suppliedPreferences &&
      option.explanation.uncertainty.some((note) =>
        note.includes(ABSENT_PREFERENCES_GUIDANCE),
      )
    )
      issue("supplied_preferences_marked_absent", "explanation.uncertainty");
    if (option.status === "unavailable") {
      if (option.optionType !== "from_wardrobe" || option.items.length)
        issue("unavailable_option_invalid", "items");
      if (inventorySupportsOutfit)
        issue("wardrobe_direction_incorrectly_unavailable", "status");
      continue;
    }
    const slots = new Set<string>();
    const selectedOwned = new Set<string>();
    const categories = new Set(option.items.map((item) => item.category));
    if (
      !categories.has("dress") &&
      !(categories.has("top") && categories.has("bottom"))
    )
      issue("incomplete_clothing_coverage", "items");
    if (
      pieces.some((piece) => piece.category === "shoes") &&
      !categories.has("shoes")
    )
      issue("missing_footwear_role", "items");
    if (categories.has("dress") && categories.has("bottom"))
      issue("conflicting_one_piece_and_bottom", "items");
    for (const [index, item] of option.items.entries()) {
      const itemPath = `items.${index}`;
      if (slots.has(item.slotId)) issue("duplicate_slot", `${itemPath}.slotId`);
      slots.add(item.slotId);
      if (
        item.pieceId &&
        (!pieceIds.has(item.pieceId) ||
          pieceIds.get(item.pieceId)?.category !== item.category)
      )
        issue("invalid_piece_reference", `${itemPath}.pieceId`);
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
          issue("invalid_owned_reference", itemPath);
        if (item.wardrobeItemId && selectedOwned.has(item.wardrobeItemId))
          issue("duplicate_physical_item", `${itemPath}.wardrobeItemId`);
        if (item.wardrobeItemId) selectedOwned.add(item.wardrobeItemId);
        if (
          owned &&
          itemConstraintConflict(
            owned,
            constraints.preferences,
            constraints.occasion,
          )
        )
          issue(
            "practical_constraint_contradiction",
            `${itemPath}.wardrobeItemId`,
          );
      } else if (
        item.wardrobeItemId !== null ||
        !item.missingBrief ||
        item.missingBrief.category !== item.category
      )
        issue("invalid_missing_brief", `${itemPath}.missingBrief`);
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
        issue("practical_constraint_contradiction", `${itemPath}.missingBrief`);
      if (option.optionType === "from_wardrobe" && item.itemKind !== "owned")
        issue("wardrobe_direction_contains_missing", `${itemPath}.itemKind`);
    }
    const composition = option.items
      .map((item) =>
        item.itemKind === "owned"
          ? `owned:${item.wardrobeItemId}`
          : `missing:${item.category}:${item.missingBrief?.subcategory?.trim().toLowerCase() ?? ""}:${JSON.stringify(
              Object.fromEntries(
                Object.entries(item.missingBrief?.attributes ?? {})
                  .filter(([, value]) => value !== null && value !== undefined)
                  .map(([key, value]) => [
                    key,
                    Array.isArray(value)
                      ? value
                          .map((entry) =>
                            typeof entry === "string"
                              ? entry.trim().toLowerCase()
                              : entry,
                          )
                          .sort()
                      : typeof value === "string"
                        ? value.trim().toLowerCase()
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
    if (compositions.has(composition)) issue("duplicate_composition", "items");
    compositions.add(composition);
  }
  return issues;
}

export function validateOptionComposition(
  options: OutfitOption[],
  pieces: MatchItem[],
  inventory: MatchItem[],
  requestedType?: OutfitOptionType,
  constraints: OutfitConstraints = { preferences: {}, occasion: null },
) {
  return [
    ...new Set(
      optionCompositionIssues(
        options,
        pieces,
        inventory,
        requestedType,
        constraints,
      ).map((issue) => issue.code),
    ),
  ];
}
