import { createHash } from "node:crypto";
import { z } from "zod";
import { attributesSchema, categorySchema } from "@/lib/ai/fashion-schema";
import { capsuleBriefSchema } from "./schema";
import { CapsuleOutputError, capsuleDiagnostics } from "./generation-schema";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const capsuleGenerationConfigSchema = z.strictObject({
  version: z.literal("capsule-generation.v2"),
  model: z.string().min(1).max(120),
  maxOutputTokens: z.number().int().min(6000).max(9000),
  reasoningEffort: z.literal("low").nullable(),
  maxProviderRequests: z.literal(2),
  deadlineMs: z.literal(200000),
});
export type CapsuleGenerationConfig = z.infer<
  typeof capsuleGenerationConfigSchema
>;
export function capsuleGenerationConfig(
  model: string,
  targetOutfits: number,
): CapsuleGenerationConfig {
  z.number().int().min(3).max(6).parse(targetOutfits);
  return capsuleGenerationConfigSchema.parse({
    version: "capsule-generation.v2",
    model,
    maxOutputTokens: 3000 + targetOutfits * 1000,
    reasoningEffort: /^gpt-5(?:[.-]|$)/.test(model) ? "low" : null,
    maxProviderRequests: 2,
    deadlineMs: 200000,
  });
}
export const capsuleSourceVersionsSchema = z.strictObject({
  promptVersion: z.string().min(1),
  knowledgeVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  promptSourceHash: hash,
  knowledgeSourceHash: hash,
  schemaSourceHash: hash,
  promptAssemblyHash: hash,
});
export type CapsuleSourceVersions = z.infer<typeof capsuleSourceVersionsSchema>;
const record = z.record(z.string(), z.json());
const fieldList = z.array(z.string().max(160)).max(160);
const factsSchema = z.strictObject({
  user: fieldList.optional(),
  catalog: fieldList.optional(),
  visual: fieldList.optional(),
  sample: fieldList.optional(),
  uncertain: fieldList.optional(),
});
const itemSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1).max(160),
  category: categorySchema,
  subcategory: z.string().max(120).nullable(),
  description: z.string().max(600),
  revision: z.number().int().positive(),
  attributes: attributesSchema,
  corrections: record.optional(),
  provenance: record.optional(),
  facts: factsSchema.optional(),
  sourceFingerprint: hash.optional(),
});
export type CapsuleSourceItem = z.infer<typeof itemSchema>;
const compactItemSchema = itemSchema
  .omit({ corrections: true, provenance: true })
  .strip();
const providerItemSchema = itemSchema
  .omit({
    sourceFingerprint: true,
    revision: true,
    corrections: true,
    provenance: true,
  })
  .strip();
const providerBriefSchema = z
  .object(capsuleBriefSchema.shape)
  .omit({ includedItemIds: true });
export const capturedCapsuleSchema = z
  .strictObject({
    brief: capsuleBriefSchema,
    capsuleRevision: z.number().int().positive(),
    items: z.array(itemSchema).min(1).max(60),
    knowledgeVersion: hash,
    itemRevisions: z.record(z.uuid(), z.number().int().positive()),
    preferences: z.record(
      z.string(),
      z.union([z.string(), z.array(z.string())]),
    ),
    preferenceRevision: z.number().int().nonnegative(),
    allowedSignals: z.array(z.string().min(1).max(2000)).min(1).max(40),
    instructions: z.string().min(1).max(4000),
    contractVersion: z.literal("capsule-context.v2").optional(),
    generationConfig: capsuleGenerationConfigSchema.optional(),
    sourceVersions: capsuleSourceVersionsSchema.optional(),
  })
  .superRefine((input, context) => {
    if (input.contractVersion) {
      if (
        !input.generationConfig ||
        !input.sourceVersions ||
        input.items.some((item) => !item.sourceFingerprint || !item.facts)
      )
        context.addIssue({
          code: "custom",
          message:
            "A versioned Capsule capture requires its complete policy and item facts.",
        });
    } else if (input.generationConfig || input.sourceVersions)
      context.addIssue({
        code: "custom",
        message: "Generation policy requires a versioned Capsule capture.",
      });
    const ids = input.items.map((item) => item.id);
    if (
      new Set(ids).size !== ids.length ||
      ids.length !== input.brief.includedItemIds.length ||
      ids.some((id) => !input.brief.includedItemIds.includes(id)) ||
      Object.keys(input.itemRevisions).length !== ids.length ||
      input.items.some((item) => input.itemRevisions[item.id] !== item.revision)
    )
      context.addIssue({
        code: "custom",
        path: ["itemRevisions"],
        message:
          "Captured items must match the exact selected membership and revisions.",
      });
  });
export type CapturedCapsule = z.infer<typeof capturedCapsuleSchema>;
export function readCapturedCapsule(value: unknown): CapturedCapsule {
  const parsed = capturedCapsuleSchema.safeParse(value);
  if (!parsed.success)
    throw new CapsuleOutputError(
      "CAPSULE_CONTEXT_INVALID",
      capsuleDiagnostics(parsed.error.issues),
    );
  return parsed.data;
}
export function stableCapsuleValue(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(stableCapsuleValue).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, nested]) =>
          `${JSON.stringify(key)}:${stableCapsuleValue(nested)}`,
      )
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function capsuleFingerprint(
  input: unknown,
  versions: {
    prompt: string;
    schema: string;
    knowledge: string;
    model: string;
  },
  legacy = false,
) {
  const identity = { input, ...versions };
  return createHash("sha256")
    .update(legacy ? JSON.stringify(identity) : stableCapsuleValue(identity))
    .digest("hex");
}
function fieldFacts(item: CapsuleSourceItem) {
  const groups: Record<string, string[]> = {};
  const fields = [
    "name",
    "category",
    "subcategory",
    "description",
    ...Object.keys(item.attributes).map((key) => `attributes.${key}`),
  ];
  for (const field of fields) {
    const key = field.startsWith("attributes.") ? field.slice(11) : field;
    const value = field.startsWith("attributes.")
      ? item.attributes[key as keyof typeof item.attributes]
      : item[field as "name" | "category" | "subcategory" | "description"];
    const correction =
      item.corrections &&
      (Object.hasOwn(item.corrections, field) ||
        Object.hasOwn(item.corrections, key));
    const provenance = z
      .object({
        source: z.string().optional(),
        state: z.string().optional(),
        confidence: z.number().nullable().optional(),
      })
      .safeParse(item.provenance?.[field]);
    const source = provenance.success ? provenance.data : {};
    const unknown =
      value == null ||
      value === "" ||
      (Array.isArray(value) && !value.length) ||
      (!correction &&
        ["unknown", "not_visible", "not_applicable"].includes(
          source.state ?? "",
        ));
    const group = unknown
      ? "uncertain"
      : correction || source.source === "user"
        ? "user"
        : source.source === "catalog"
          ? "catalog"
          : source.source === "sample"
            ? "sample"
            : ["visual_inference", "derived"].includes(source.source ?? "")
              ? "visual"
              : "uncertain";
    (groups[group] ??= []).push(field);
    if (
      !unknown &&
      !correction &&
      typeof source.confidence === "number" &&
      source.confidence < 0.7
    )
      (groups.uncertain ??= []).push(field);
  }
  return factsSchema.parse(
    Object.fromEntries(
      Object.entries(groups).map(([key, values]) => [
        key,
        [...new Set(values)].sort(),
      ]),
    ),
  );
}
export function compactCapsuleItem(item: CapsuleSourceItem): CapsuleSourceItem {
  const attributes = Object.fromEntries(
    Object.entries(item.attributes).filter(
      ([, value]) => value != null && (!Array.isArray(value) || value.length),
    ),
  );
  return itemSchema.parse({
    ...compactItemSchema.parse(item),
    attributes,
    facts: fieldFacts(item),
    sourceFingerprint: createHash("sha256")
      .update(stableCapsuleValue(item))
      .digest("hex"),
  });
}
export function capsuleProviderContext(input: CapturedCapsule) {
  if (!input.contractVersion) return input;
  return {
    brief: providerBriefSchema.parse(input.brief),
    items: input.items.map((item) => providerItemSchema.parse(item)),
    preferences: input.preferences,
    allowedSignals: input.allowedSignals,
  };
}
