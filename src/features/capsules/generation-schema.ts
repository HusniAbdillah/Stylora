import { z } from "zod";
import { attributesSchema, garmentSchema } from "@/lib/ai/fashion-schema";
import { OperationError } from "@/features/operations/errors";
import { categorySchema, type CapsuleDraftState } from "./schema";

const text = z.string().trim().min(1).max(600);
export const missingBriefSchema = z.strictObject({
  schemaVersion: z.literal("fashion-item.v1"),
  name: garmentSchema.shape.name,
  category: categorySchema,
  subcategory: garmentSchema.shape.subcategory,
  description: garmentSchema.shape.description,
  inventoryStatus: z.literal("not_applicable"),
  attributes: z.strictObject({
    garmentForm: attributesSchema.shape.garmentForm.unwrap(),
    functionalFamily: attributesSchema.shape.functionalFamily.unwrap(),
    primaryColor: attributesSchema.shape.primaryColor.unwrap(),
    pattern: attributesSchema.shape.pattern.unwrap(),
    apparentMaterial: attributesSchema.shape.apparentMaterial.unwrap(),
    silhouette: attributesSchema.shape.silhouette.unwrap(),
    fit: attributesSchema.shape.fit.unwrap(),
    layeringRole: attributesSchema.shape.layeringRole.unwrap(),
    formality: attributesSchema.shape.formality.unwrap(),
    coverage: attributesSchema.shape.coverage.unwrap(),
  }),
  uncertainty: garmentSchema.shape.uncertainty,
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

export type CapsuleDiagnostic = { code: string; path: string };
const diagnosticFields = new Set([
  ...Object.keys(capsuleGenerationSchema.shape),
  ...Object.keys(capsuleGenerationSchema.shape.outfits.element.shape),
  ...Object.keys(capsuleGenerationSchema.shape.additions.element.shape),
  ...Object.keys(missingBriefSchema.shape),
  ...Object.keys(attributesSchema.shape),
  "reason",
  "evidenceItemIds",
  "input",
  "output",
  "response",
  "status",
  "incomplete_details",
  "reason",
  "content",
  "text",
  "itemRevisions",
  "preferenceRevision",
  "brief",
  "capsuleRevision",
  "contractVersion",
  "generationConfig",
  "sourceVersions",
  "sourceFingerprint",
  "model",
  "prompt_version",
  "schema_version",
  "promptVersion",
  "schemaVersion",
  "knowledgeVersion",
  "maxOutputTokens",
  "reasoningEffort",
  "maxProviderRequests",
  "deadlineMs",
  "facts",
  "type",
]);
export function capsuleDiagnostics(
  issues: readonly { code: string; path: readonly PropertyKey[] }[],
): CapsuleDiagnostic[] {
  return issues.slice(0, 10).map((issue) => ({
    code: /^[A-Za-z0-9_]{1,80}$/.test(issue.code)
      ? issue.code
      : "VALIDATION_FAILED",
    path:
      issue.path
        .slice(0, 10)
        .map((part) =>
          typeof part === "number"
            ? `[${Math.min(999, Math.max(0, part))}]`
            : diagnosticFields.has(String(part))
              ? String(part)
              : "*",
        )
        .join(".")
        .replace(/\.\[/g, "[") || "output",
  }));
}
export class CapsuleOutputError extends OperationError {
  providerAttempts = 0;
  constructor(
    code: string,
    public readonly diagnostics: CapsuleDiagnostic[],
  ) {
    super(code, code.toLowerCase(), 422, false);
    this.name = "CapsuleOutputError";
  }
}
function invalid(code: string, path: (string | number)[]): never {
  throw new CapsuleOutputError(code, capsuleDiagnostics([{ code, path }]));
}

export function capsuleProviderSchema(
  draft: CapsuleDraftState["brief"],
  items: readonly CapsuleReasoningItem[],
  signals: readonly string[],
) {
  const allowedIds = items
    .filter(
      (item) =>
        draft.includedItemIds.includes(item.id) &&
        !draft.excludedItemIds.includes(item.id),
    )
    .map((item) => item.id);
  if (!allowedIds.length || !signals.length)
    invalid("CAPSULE_CONTEXT_INVALID", ["input"]);
  const ownedId = z.enum(allowedIds);
  const shortReason = reasonSchema.extend({
    reason: text.max(300),
    evidenceItemIds: z
      .array(ownedId)
      .min(1)
      .max(Math.min(12, allowedIds.length)),
  });
  const outfit = capsuleGenerationSchema.shape.outfits.element.extend({
    itemIds: z.array(ownedId).min(1).max(Math.min(20, allowedIds.length)),
    summary: text.max(360),
    whyThis: z.array(shortReason).length(2),
    inputsUsed: z
      .array(z.enum([...signals]))
      .min(1)
      .max(Math.min(12, signals.length)),
    differences: z.array(text.max(240)).max(3),
    uncertainty: z.array(text.max(240)).max(3),
  });
  const addition = capsuleGenerationSchema.shape.additions.element.extend({
    supportingItemIds: z
      .array(ownedId)
      .min(2)
      .max(Math.max(2, Math.min(20, allowedIds.length))),
    unlockedOutfitIndices: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(draft.targetOutfits - 1),
      )
      .min(2)
      .max(draft.targetOutfits),
  });
  return capsuleGenerationSchema.extend({
    outfits: z.array(outfit).length(draft.targetOutfits),
    additions: z.array(addition).max(allowedIds.length < 2 ? 0 : 3),
  });
}

export function validateCapsuleGeneration(
  value: unknown,
  draft: CapsuleDraftState["brief"],
  items: CapsuleReasoningItem[],
  signals: string[],
) {
  const parsed = capsuleGenerationSchema.safeParse(value);
  if (!parsed.success)
    throw new CapsuleOutputError(
      "CAPSULE_SCHEMA_INVALID",
      capsuleDiagnostics(parsed.error.issues),
    );
  const output = parsed.data;
  const inventory = new Map(items.map((item) => [item.id, item]));
  const allowed = new Set(draft.includedItemIds);
  const additions = new Map(
    output.additions.map((addition) => [addition.key, addition]),
  );
  const compositions = new Set<string>();
  const used = new Set<string>();
  if (output.outfits.length !== draft.targetOutfits)
    invalid("CAPSULE_OUTPUT_COUNT_INVALID", ["outfits"]);
  if (additions.size !== output.additions.length)
    invalid("CAPSULE_ADDITION_KEY_DUPLICATE", ["additions"]);
  output.outfits.forEach((outfit, outfitIndex) => {
    if (new Set(outfit.itemIds).size !== outfit.itemIds.length)
      invalid("CAPSULE_REFERENCE_DUPLICATE", [
        "outfits",
        outfitIndex,
        "itemIds",
      ]);
    if (new Set(outfit.additionKeys).size !== outfit.additionKeys.length)
      invalid("CAPSULE_REFERENCE_DUPLICATE", [
        "outfits",
        outfitIndex,
        "additionKeys",
      ]);
    outfit.itemIds.forEach((id, index) => {
      if (
        !allowed.has(id) ||
        !inventory.has(id) ||
        draft.excludedItemIds.includes(id)
      )
        invalid("CAPSULE_REFERENCE_INVALID", [
          "outfits",
          outfitIndex,
          "itemIds",
          index,
        ]);
    });
    outfit.additionKeys.forEach((key, index) => {
      if (!additions.get(key)?.unlockedOutfitIndices.includes(outfitIndex))
        invalid("CAPSULE_ADDITION_REFERENCE_INVALID", [
          "outfits",
          outfitIndex,
          "additionKeys",
          index,
        ]);
    });
    outfit.inputsUsed.forEach((signal, index) => {
      if (!signals.includes(signal))
        invalid("CAPSULE_SIGNAL_INVALID", [
          "outfits",
          outfitIndex,
          "inputsUsed",
          index,
        ]);
    });
    outfit.whyThis.forEach((reason, index) => {
      if (reason.evidenceItemIds.some((id) => !outfit.itemIds.includes(id)))
        invalid("CAPSULE_EVIDENCE_INVALID", [
          "outfits",
          outfitIndex,
          "whyThis",
          index,
          "evidenceItemIds",
        ]);
    });
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
      invalid("CAPSULE_OUTFIT_INCOMPLETE", ["outfits", outfitIndex, "itemIds"]);
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
      invalid("CAPSULE_OUTFITS_NOT_DISTINCT", [
        "outfits",
        outfitIndex,
        "itemIds",
      ]);
    compositions.add(composition);
    outfit.itemIds.forEach((id) => used.add(id));
  });
  if (draft.requiredItemIds.some((id) => !used.has(id)))
    invalid("CAPSULE_REQUIRED_ITEM_MISSING", ["outfits"]);
  output.additions.forEach((addition, additionIndex) => {
    const indices = addition.unlockedOutfitIndices;
    if (
      new Set(indices).size !== indices.length ||
      new Set(addition.supportingItemIds).size !==
        addition.supportingItemIds.length ||
      addition.supportingItemIds.some(
        (id) =>
          !allowed.has(id) ||
          !inventory.has(id) ||
          draft.excludedItemIds.includes(id),
      ) ||
      indices.some(
        (index) => !output.outfits[index]?.additionKeys.includes(addition.key),
      ) ||
      addition.supportingItemIds.some(
        (id) =>
          !indices.some((index) => output.outfits[index]?.itemIds.includes(id)),
      )
    )
      invalid("CAPSULE_REUSE_EVIDENCE_INVALID", ["additions", additionIndex]);
  });
  return output;
}
