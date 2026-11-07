import { z } from "zod";
import { categorySchema, type CapsuleDraftState } from "./schema";

const text = z.string().trim().min(1).max(600);
const attribute = z.string().trim().max(120).nullable();
export const missingBriefSchema = z.strictObject({
  schemaVersion: z.literal("fashion-item.v1"),
  name: z.string().trim().min(1).max(160),
  category: categorySchema,
  subcategory: attribute,
  description: text,
  inventoryStatus: z.literal("not_applicable"),
  attributes: z.strictObject({
    garmentForm: attribute,
    functionalFamily: attribute,
    primaryColor: attribute,
    pattern: attribute,
    apparentMaterial: attribute,
    silhouette: attribute,
    fit: attribute,
    layeringRole: attribute,
    formality: attribute,
    coverage: attribute,
  }),
  uncertainty: z.array(text).max(8),
});

const reasonSchema = z.strictObject({
  reason: text,
  evidenceItemIds: z.array(z.uuid()).min(1).max(12),
});
export const capsuleGenerationSchema = z.strictObject({
  outfits: z
    .array(
      z.strictObject({
        title: z.string().trim().min(1).max(160),
        occasion: z.string().trim().max(120),
        itemIds: z.array(z.uuid()).min(1).max(20),
        additionKeys: z.array(z.string().max(40)).max(3),
        summary: text,
        whyThis: z.array(reasonSchema).min(2).max(4),
        inputsUsed: z.array(text).min(1).max(12),
        differences: z.array(text).max(8),
        uncertainty: z.array(text).max(8),
      }),
    )
    .min(3)
    .max(6),
  additions: z
    .array(
      z.strictObject({
        key: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
        brief: missingBriefSchema,
        roleGap: text,
        supportingItemIds: z.array(z.uuid()).min(2).max(20),
        unlockedOutfitIndices: z
          .array(z.number().int().min(0).max(5))
          .min(2)
          .max(6),
      }),
    )
    .max(3),
});
export type CapsuleGeneration = z.infer<typeof capsuleGenerationSchema>;
export type CapsuleReasoningItem = {
  id: string;
  name: string;
  category: z.infer<typeof categorySchema>;
  revision: number;
  attributes: unknown;
};

export function validateCapsuleGeneration(
  value: unknown,
  draft: CapsuleDraftState["brief"],
  items: CapsuleReasoningItem[],
  signals: string[],
) {
  const output = capsuleGenerationSchema.parse(value);
  const inventory = new Map(items.map((item) => [item.id, item]));
  const allowed = new Set(draft.includedItemIds);
  const additions = new Map(
    output.additions.map((addition) => [addition.key, addition]),
  );
  const compositions = new Set<string>();
  const used = new Set<string>();
  if (
    output.outfits.length !== draft.targetOutfits ||
    additions.size !== output.additions.length
  )
    throw new Error("capsule_output_invalid");
  output.outfits.forEach((outfit) => {
    if (
      new Set(outfit.itemIds).size !== outfit.itemIds.length ||
      new Set(outfit.additionKeys).size !== outfit.additionKeys.length ||
      outfit.itemIds.some(
        (id) =>
          !allowed.has(id) ||
          !inventory.has(id) ||
          draft.excludedItemIds.includes(id),
      ) ||
      outfit.additionKeys.some((key) => !additions.has(key)) ||
      outfit.inputsUsed.some((signal) => !signals.includes(signal)) ||
      outfit.whyThis.some((reason) =>
        reason.evidenceItemIds.some((id) => !outfit.itemIds.includes(id)),
      )
    )
      throw new Error("capsule_output_invalid");
    const categories = new Set(
      outfit.itemIds.map((id) => inventory.get(id)!.category),
    );
    outfit.additionKeys.forEach((key) =>
      categories.add(additions.get(key)!.brief.category),
    );
    if (
      !(
        categories.has("dress") ||
        (categories.has("top") && categories.has("bottom"))
      ) ||
      !categories.has("shoes")
    )
      throw new Error("capsule_outfit_incomplete");
    const composition = [
      ...outfit.itemIds.filter(
        (id) => inventory.get(id)!.category !== "accessory",
      ),
      ...outfit.additionKeys
        .filter((key) => additions.get(key)!.brief.category !== "accessory")
        .map((key) => `missing:${key}`),
    ]
      .sort()
      .join("|");
    if (compositions.has(composition))
      throw new Error("capsule_outfits_not_distinct");
    compositions.add(composition);
    outfit.itemIds.forEach((id) => used.add(id));
  });
  if (draft.requiredItemIds.some((id) => !used.has(id)))
    throw new Error("capsule_required_item_missing");
  output.additions.forEach((addition) => {
    const indices = addition.unlockedOutfitIndices;
    if (
      new Set(indices).size !== indices.length ||
      new Set(addition.supportingItemIds).size !==
        addition.supportingItemIds.length ||
      addition.supportingItemIds.some((id) => !allowed.has(id)) ||
      indices.some(
        (index) => !output.outfits[index]?.additionKeys.includes(addition.key),
      ) ||
      addition.supportingItemIds.some(
        (id) =>
          !indices.some((index) => output.outfits[index]?.itemIds.includes(id)),
      )
    )
      throw new Error("capsule_reuse_evidence_invalid");
  });
  return output;
}
