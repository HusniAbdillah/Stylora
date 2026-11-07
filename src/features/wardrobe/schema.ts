import { z } from "zod";
import {
  attributesSchema,
  categorySchema,
  garmentSchema,
  observationSchema,
  FASHION_SCHEMA_VERSION,
} from "@/lib/ai/fashion-schema";
import type { Database } from "@/types/database";

export const revisionSchema = z.number().int().positive();
export const itemValuesSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(160),
    category: categorySchema,
    subcategory: z.string().trim().min(1).max(120).nullable(),
    description: z.string().trim().max(600),
    attributes: attributesSchema,
  })
  .superRefine(({ category, attributes }, context) => {
    const result = garmentSchema.safeParse({
      name: "Draft",
      category,
      subcategory: null,
      description: "Draft",
      attributes,
      observations: [],
      confidence: null,
      uncertainty: [],
    });
    if (!result.success)
      for (const issue of result.error.issues)
        context.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
  });
export const draftValuesSchema = itemValuesSchema.safeExtend({
  name: z.string().max(160),
  subcategory: z.string().max(120).nullable(),
  description: z.string().max(600),
});
export const proposalSchema = z.strictObject({
  id: z.uuid(),
  values: draftValuesSchema,
  original: garmentSchema.nullable(),
});
export const draftPayloadSchema = z.strictObject({
  version: z.literal("wardrobe-draft.v1"),
  mode: z.enum(["manual", "live"]),
  proposals: z.array(proposalSchema).max(24),
  saved: z.record(z.uuid(), z.uuid()),
  metadata: z.record(z.string(), z.json()),
  pendingUpload: z
    .strictObject({
      assetId: z.uuid(),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      byteSize: z
        .number()
        .int()
        .positive()
        .max(10 * 1024 * 1024),
    })
    .optional(),
  editor: z
    .strictObject({
      itemId: z.uuid(),
      baseRevision: revisionSchema,
      values: draftValuesSchema,
      notes: z.string().max(4000),
    })
    .optional(),
});
export const saveDraftSchema = z.strictObject({
  expectedRevision: revisionSchema,
  occasion: z.string().trim().max(120).optional(),
  proposals: z.array(proposalSchema.omit({ original: true })).max(24),
});
export const uploadSchema = z.strictObject({
  draftId: z.uuid(),
  expectedRevision: revisionSchema,
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024),
});
export const mutationSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("edit"),
    expectedRevision: revisionSchema,
    values: itemValuesSchema,
    notes: z.string().trim().max(4000),
    clearCorrections: z.array(z.string().max(160)).max(160).default([]),
  }),
  z.strictObject({
    action: z.enum(["archive", "restore", "mark_owned"]),
    expectedRevision: revisionSchema,
  }),
  z.strictObject({
    action: z.literal("replace_photo"),
    expectedRevision: revisionSchema,
    draftId: z.uuid(),
    draftRevision: revisionSchema,
  }),
]);
export const listQuerySchema = z.strictObject({
  category: z.union([categorySchema, z.literal("all")]).default("all"),
  status: z
    .enum(["all", "owned", "saved_candidate", "archived"])
    .default("all"),
  q: z.string().trim().max(120).default(""),
});
const evidenceSchema = observationSchema
  .omit({ path: true })
  .extend({
    uncertainty: z.string().max(400).nullable().default(null),
    assetId: z.uuid().nullable().optional(),
    provider: z.string().max(120).nullable().optional(),
    model: z.string().max(120).nullable().optional(),
  })
  .passthrough();
const correctionSchema = z.strictObject({
  originalValue: z.json(),
  previousValue: z.json(),
  value: z.json(),
  source: z.literal("user"),
  timestamp: z.iso.datetime({ offset: true }),
  revision: revisionSchema,
});
export const provenanceSchema = z.record(z.string().max(160), evidenceSchema);
// Earlier marketplace imports omitted confidence and catalog evidence text.
const importedProvenanceSchema = z.record(
  z.string().max(160),
  z.union([
    evidenceSchema,
    evidenceSchema.extend({
      source: z.enum(["catalog", "derived"]),
      confidence: evidenceSchema.shape.confidence.default(null),
      evidence: evidenceSchema.shape.evidence.default(""),
    }),
  ]),
);
export const correctionsSchema = z.record(
  z.string().max(160),
  correctionSchema,
);
export type ItemValues = z.infer<typeof itemValuesSchema>;
export type DraftPayload = z.infer<typeof draftPayloadSchema>;
export type WardrobeRow = Database["public"]["Tables"]["wardrobe_items"]["Row"];

type WardrobeReadRow =
  | WardrobeRow
  | Database["public"]["Functions"]["wardrobe_item_command"]["Returns"];

export function toCanonicalWardrobeItem(row: WardrobeReadRow) {
  const values = itemValuesSchema.parse({
    name: row.name,
    category: row.category,
    subcategory: row.subcategory,
    description: row.description,
    attributes: row.attributes,
  });
  return {
    ...values,
    id: z.uuid().parse(row.id),
    schemaVersion: FASHION_SCHEMA_VERSION,
    revision: revisionSchema.parse(row.revision),
    assetId: z.uuid().nullable().parse(row.asset_id),
    sourceReference: { kind: "wardrobe" as const, id: row.id },
    sourceType: z.enum(["manual", "live", "sample"]).parse(row.source_type),
    inventoryStatus: z
      .enum(["owned", "saved_candidate"])
      .parse(row.inventory_status),
    provenance: (row.source_product_id
      ? importedProvenanceSchema
      : provenanceSchema
    ).parse(row.provenance),
    corrections: correctionsSchema.parse(row.corrections),
    inferredAttributes: attributesSchema.parse(row.inferred_attributes),
    confidence: z.number().min(0).max(1).nullable().parse(row.confidence),
    uncertainty: z.array(z.string().max(400)).max(12).parse(row.uncertainty),
    notes: z.string().max(4000).parse(row.notes),
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    sourceProductId: row.source_product_id,
    imageUrl: row.asset_id
      ? `/api/wardrobe/${row.id}/image?revision=${row.revision}`
      : "",
  };
}
export type CanonicalWardrobeItem = ReturnType<typeof toCanonicalWardrobeItem>;

export function valuesByPath(
  item: ItemValues,
): Record<string, z.infer<ReturnType<typeof z.json>>> {
  return {
    name: item.name,
    category: item.category,
    subcategory: item.subcategory,
    description: item.description,
    ...Object.fromEntries(
      Object.entries(item.attributes)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [
          `attributes.${key}`,
          value as z.infer<ReturnType<typeof z.json>>,
        ]),
    ),
  };
}

export function applyUserEdit(
  current: ItemValues,
  next: ItemValues,
  existing: unknown,
  revision: number,
  clear: string[] = [],
) {
  const corrections = correctionsSchema.parse(existing);
  const before = valuesByPath(current);
  const after = valuesByPath(next);
  for (const path of clear) {
    if (!corrections[path]) throw new Error("invalid_correction");
    after[path] = corrections[path].originalValue;
    delete corrections[path];
  }
  for (const path of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (
      clear.includes(path) ||
      JSON.stringify(before[path] ?? null) ===
        JSON.stringify(after[path] ?? null)
    )
      continue;
    corrections[path] = {
      originalValue: corrections[path]
        ? corrections[path].originalValue
        : (before[path] ?? null),
      previousValue: before[path] ?? null,
      value: after[path] ?? null,
      source: "user",
      timestamp: new Date().toISOString(),
      revision,
    };
  }
  const values = itemValuesSchema.parse({
    ...next,
    name: after.name,
    category: after.category,
    subcategory: after.subcategory,
    description: after.description,
    attributes: Object.fromEntries(
      Object.entries(after)
        .filter(
          ([key, value]) => key.startsWith("attributes.") && value != null,
        )
        .map(([key, value]) => [key.slice(11), value]),
    ),
  });
  if (JSON.stringify(corrections).length > 30000)
    throw new Error("corrections_too_large");
  return { values, corrections };
}
