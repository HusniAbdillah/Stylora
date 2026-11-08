import { z } from "zod";
import {
  evidenceReferenceSchema,
  explanationSchema,
} from "@/lib/ai/fashion-schema";
import type { MatchItem } from "./gates";

type EvidenceValue =
  string | number | boolean | Array<string | number | boolean>;
type EvidenceEntry = {
  key: number;
  reference: z.infer<typeof evidenceReferenceSchema>;
  value: EvidenceValue;
};

const unknownValues = new Set([
  "unknown",
  "not_visible",
  "not_applicable",
  "unsure",
]);

function scalar(value: unknown): value is string | number | boolean {
  return typeof value === "string"
    ? Boolean(value.trim()) && !unknownValues.has(value.trim().toLowerCase())
    : typeof value === "number"
      ? Number.isFinite(value)
      : typeof value === "boolean";
}

function populatedPaths(
  value: Record<string, unknown>,
  prefix = "",
): Array<{ path: string; value: EvidenceValue }> {
  return Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, entry]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key) || path.length > 160) return [];
      if (scalar(entry)) return [{ path, value: entry }];
      if (Array.isArray(entry)) {
        return entry.length && entry.every(scalar)
          ? [{ path, value: entry }]
          : [];
      }
      return entry && typeof entry === "object"
        ? populatedPaths(entry as Record<string, unknown>, path)
        : [];
    });
}

export function projectRecommendationItem(item: MatchItem) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    subcategory: item.subcategory,
    description: item.description,
    attributes: Object.fromEntries(
      Object.entries(item.attributes).filter(
        ([, value]) =>
          value !== null &&
          value !== undefined &&
          (!Array.isArray(value) || value.length > 0),
      ),
    ),
    revision: item.revision,
    confidence: item.confidence,
    uncertainty: item.uncertainty,
    sourceType: item.sourceType,
    inventoryStatus: item.inventoryStatus,
    archivedAt: item.archivedAt,
  };
}

export function projectRecommendationIndex(item: MatchItem) {
  return {
    id: item.id, name: item.name, category: item.category, subcategory: item.subcategory,
    revision: item.revision, sourceType: item.sourceType,
    inventoryStatus: item.inventoryStatus, archivedAt: item.archivedAt,
  };
}

export function createEvidenceProjection(input: {
  pieces: MatchItem[];
  inventory: MatchItem[];
  preferences: Record<string, string | string[]>;
  occasion: string | null;
  sourceRevision: number;
}) {
  const catalog: EvidenceEntry[] = [];
  function add(
    source: EvidenceEntry["reference"]["source"],
    id: string | null,
    value: Record<string, unknown>,
  ) {
    for (const entry of populatedPaths(value)) {
      catalog.push({
        key: catalog.length + 1,
        reference: evidenceReferenceSchema.parse({
          source,
          id,
          path: entry.path,
        }),
        value: entry.value,
      });
    }
  }
  for (const piece of input.pieces)
    add("inspiration", piece.id, projectRecommendationItem(piece));
  for (const item of input.inventory)
    add("wardrobe", item.id, projectRecommendationItem(item));
  add("preference", null, input.preferences);
  add("context", null, { occasion: input.occasion });
  if (!catalog.length) throw new Error("evidence_catalog_empty");
  const allowedInputs = [
    ...(catalog.some((entry) => entry.reference.source === "inspiration")
      ? ["inspiration"]
      : []),
    ...(catalog.some((entry) => entry.reference.source === "wardrobe")
      ? ["wardrobe"]
      : []),
    ...(catalog.some(
      (entry) =>
        entry.reference.source === "context" &&
        entry.reference.path === "occasion",
    )
      ? ["occasion"]
      : []),
    ...catalog
      .filter((entry) => entry.reference.source === "preference")
      .map((entry) => entry.reference.path),
  ];
  const references = new Map(
    catalog.map((entry) => [entry.key, entry.reference]),
  );
  const providerSchema = explanationSchema.extend({
    whyThis: z
      .array(
        z.strictObject({
          reason: explanationSchema.shape.whyThis.element.shape.reason,
          evidence: z
            .array(z.number().int().min(1).max(catalog.length))
            .min(1)
            .max(8),
        }),
      )
      .min(2)
      .max(4),
    inputsUsed: z.array(z.enum([...new Set(allowedInputs)])).max(32),
    sourceRevision: z.literal(input.sourceRevision),
  });
  const schema = providerSchema.transform((value) =>
    explanationSchema.parse({
      ...value,
      whyThis: value.whyThis.map((reason) => ({
        ...reason,
        evidence: reason.evidence.map((key) => {
          const reference = references.get(key);
          if (!reference) throw new Error("evidence_reference_unavailable");
          return reference;
        }),
      })),
    }),
  );
  const providerCatalog = catalog.map(({ key, reference, value }) => [
    key,
    reference.source,
    reference.id,
    reference.path,
    value,
  ]);
  return { schema, catalog, providerCatalog, allowedInputs };
}
