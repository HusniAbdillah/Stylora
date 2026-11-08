import { z } from "zod";
import { categorySchema, compactGarmentOutputSchema, type Explanation } from "@/lib/ai/fashion-schema";
import { isOwnedInventoryItem, itemConstraintConflict, type InventoryMode, type MatchItem } from "@/features/matching/gates";
import { missingBriefSchema, outfitItemSchema, outfitOptionsSchema, optionTypeSchema, wardrobeSupportsOutfit, type OutfitOption, type OutfitOptionType } from "./schema";

export function outfitProviderSchema(input: {
  pieces: MatchItem[]; inventory: MatchItem[]; optionType?: OutfitOptionType;
  preferences: Record<string, string | string[]>; occasion: string | null; inventoryMode?: InventoryMode;
}, explanation: z.ZodType<Explanation>) {
  const owned = input.inventory.filter((item) => isOwnedInventoryItem(item, input.inventoryMode) &&
    !itemConstraintConflict(item, input.preferences, input.occasion));
  const types = input.optionType ? [input.optionType] : optionTypeSchema.options;
  const ownedSchemas: z.ZodType<z.infer<typeof outfitItemSchema>>[] = [];
  const itemSchemas: typeof ownedSchemas = categorySchema.options.flatMap((category) => {
    const pieceIds = input.pieces.filter((piece) => piece.category === category).map((piece) => piece.id);
    const pieceId = pieceIds.length ? z.enum(pieceIds).nullable() : z.null();
    const ownedIds = owned.filter((item) => item.category === category).map((item) => item.id);
    const ownedForCategory = ownedIds.length ? [outfitItemSchema.extend({
        category: z.literal(category), itemKind: z.literal("owned"), pieceId,
        wardrobeItemId: z.enum(ownedIds), missingBrief: z.null(),
      })] : [];
    ownedSchemas.push(...ownedForCategory);
    return [ ...ownedForCategory,
      outfitItemSchema.extend({
        category: z.literal(category), itemKind: z.literal("missing"), pieceId, wardrobeItemId: z.null(),
        missingBrief: z.strictObject({
          schemaVersion: z.literal("fashion-item.v1"),
          garment: compactGarmentOutputSchema(category, true),
        }).transform(({ schemaVersion, garment }) => ({ ...garment, schemaVersion })).pipe(missingBriefSchema),
      }),
    ];
  });
  const options: Record<string, z.ZodType<OutfitOption>> = {};
  for (const type of types) {
    const available = type !== "from_wardrobe" || wardrobeSupportsOutfit(input.pieces, input.inventory, input);
    const choices = type === "from_wardrobe" && ownedSchemas.length ? ownedSchemas : itemSchemas;
    options[type] = outfitOptionsSchema.shape.options.element.omit({ optionType: true }).extend({
      explanation, status: z.literal(available ? "ready" : "unavailable"),
      items: available ? z.array(z.union(choices)).min(1).max(12) : z.array(z.union(choices)).length(0),
    }).transform((value) => ({ ...value, optionType: type }));
  }
  return z.strictObject({ options: z.strictObject(options).transform((value) => types.map((type) => value[type])) });
}
