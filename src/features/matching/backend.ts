import "server-only";
import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api";
import {
  attributesSchema,
  categorySchema,
  explanationSchema,
} from "@/lib/ai/fashion-schema";
import { fashionValidationFailure, requestFashion } from "@/lib/ai/provider";
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import { z } from "zod";
import {
  evaluateCandidate,
  classifyInventoryMatch,
  resolveEffectiveAttributes,
  type InventoryMode,
  type MatchItem,
} from "./gates";
import { explainedMatchesSchema, type MatchResult } from "./schema";
import {
  createEvidenceProjection,
  projectRecommendationItem,
} from "./evidence";

export type { MatchItem, InventoryMode } from "./gates";
export type MatchContext = {
  preferences: Record<string, string | string[]>;
  occasion: string | null;
  sourceRevision: number;
  inventoryMode?: InventoryMode;
  onProviderMetadata?: (metadata: unknown) => void;
};

const inventoryRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  confidence: z.number().min(0).max(1).nullable(),
  uncertainty: z.array(z.string()),
  category: categorySchema,
  subcategory: z.string().nullable(),
  attributes: z.record(z.string(), z.unknown()),
  inferred_attributes: z.record(z.string(), z.unknown()),
  corrections: z.record(z.string(), z.unknown()),
  provenance: z.record(z.string(), z.unknown()),
  source_type: z.enum(["live", "manual", "sample"]),
  revision: z.number().int().positive(),
  asset_id: z.uuid().nullable(),
  inventory_status: z.enum(["owned", "saved_candidate"]),
  archived_at: z.string().nullable(),
});

export async function listInventory(
  mode: InventoryMode,
  signal = AbortSignal.timeout(15000),
) {
  const { client, workspaceId } = getWorkspaceDatabase();
  const rows: z.infer<typeof inventoryRowSchema>[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query = client
      .from("wardrobe_items")
      .select(
        "id,name,description,confidence,uncertainty,category,subcategory,attributes,inferred_attributes,corrections,provenance,source_type,revision,asset_id,inventory_status,archived_at",
      )
      .eq("workspace_id", workspaceId);
    if (mode !== "combined") {
      query = query.eq("inventory_status", "owned").is("archived_at", null);
      query =
        mode === "sample"
          ? query.eq("source_type", "sample")
          : query.neq("source_type", "sample");
    }
    const { data, error } = await query
      .order("id")
      .range(offset, offset + pageSize - 1)
      .abortSignal(signal);
    if (error)
      throw new ApiError(
        "inventory_read_failed",
        "Wardrobe matching is unavailable. Try again.",
        503,
        true,
      );
    const page = z.array(inventoryRowSchema).parse(data ?? []);
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  const items: MatchItem[] = rows.map((parsed) => {
    return {
      id: parsed.id,
      name: parsed.name,
      category: parsed.category,
      subcategory: parsed.subcategory,
      attributes: attributesSchema.parse(
        resolveEffectiveAttributes({
          attributes: parsed.attributes,
          inferredAttributes: parsed.inferred_attributes,
          corrections: parsed.corrections,
          provenance: parsed.provenance,
        }),
      ),
      sourceType: parsed.source_type,
      revision: parsed.revision,
      description: parsed.description,
      confidence: parsed.confidence,
      uncertainty: parsed.uncertainty,
      provenance: parsed.provenance,
      assetId: parsed.asset_id,
      inventoryStatus: parsed.inventory_status,
      archivedAt: parsed.archived_at,
    };
  });
  return {
    items,
    mode,
    fingerprint: createHash("sha256")
      .update(JSON.stringify(items))
      .digest("hex"),
  };
}

function pathValue(value: unknown, path: string): unknown {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*$/.test(path))
    return undefined;
  let current = value;
  for (const key of path.split(".")) {
    if (
      !current ||
      typeof current !== "object" ||
      !Object.prototype.hasOwnProperty.call(current, key)
    )
      return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function validateExplanation(
  explanation: z.infer<typeof explanationSchema>,
  pieces: MatchItem[],
  inventory: MatchItem[],
  context: MatchContext,
) {
  const allowedInputs = new Set([
    "inspiration",
    ...(inventory.length ? ["wardrobe"] : []),
    ...(context.occasion ? ["occasion"] : []),
    ...Object.keys(context.preferences),
  ]);
  if (
    explanation.sourceRevision !== context.sourceRevision ||
    explanation.inputsUsed.some((key) => !allowedInputs.has(key))
  )
    throw new ApiError(
      "invalid_explanation_context",
      "The recommendation referenced unavailable context.",
      502,
    );
  for (const [reasonIndex, reason] of explanation.whyThis.entries())
    for (const [evidenceIndex, evidence] of reason.evidence.entries()) {
      const path = `whyThis.${reasonIndex}.evidence.${evidenceIndex}`;
      if (
        (evidence.source === "preference" || evidence.source === "context") &&
        evidence.id !== null
      )
        throw fashionValidationFailure("invalid_explanation_evidence", [
          { code: "context_id_invalid", path },
        ]);
      let source: unknown;
      if (evidence.source === "inspiration")
        source = pieces.find((piece) => piece.id === evidence.id);
      else if (evidence.source === "wardrobe")
        source = inventory.find((item) => item.id === evidence.id);
      else if (evidence.source === "preference") source = context.preferences;
      else source = { occasion: context.occasion };
      const value = pathValue(source, evidence.path);
      if (
        value === undefined ||
        value === null ||
        (Array.isArray(value) && !value.length)
      )
        throw fashionValidationFailure("invalid_explanation_evidence", [
          { code: "evidence_unavailable", path },
        ]);
    }
}

export async function calculateMatches(
  pieces: MatchItem[],
  inventory: MatchItem[],
  context: MatchContext,
): Promise<MatchResult[]> {
  if (!pieces.length)
    throw new ApiError(
      "pieces_not_ready",
      "Review at least one piece before wardrobe matching.",
      409,
    );
  const planned = pieces.map((piece) => {
    const ranked = inventory
      .map((candidate) => ({
        candidate,
        comparison: evaluateCandidate(
          piece,
          candidate,
          context.occasion,
          context.preferences,
          context.inventoryMode,
        ),
      }))
      .sort(
        (left, right) =>
          right.comparison.score - left.comparison.score ||
          Number(right.candidate.inventoryStatus === "owned") -
            Number(left.candidate.inventoryStatus === "owned") ||
          left.candidate.id.localeCompare(right.candidate.id),
      );
    const chosen = ranked.find((entry) => entry.comparison.eligible);
    return {
      piece,
      chosen,
      pieceId: piece.id,
      wardrobeItemId: chosen?.candidate.id ?? null,
      outcome: chosen
        ? classifyInventoryMatch(chosen.candidate, chosen.comparison)
        : ("missing" as const),
      score: chosen?.comparison.score ?? null,
      sharedAttributes: chosen?.comparison.sharedAttributes ?? [],
      differences: chosen?.comparison.differences ?? [],
      evidenceCoverage: chosen?.comparison.evidenceCoverage ?? 0,
      rejectedCandidates: ranked
        .filter((entry) => !entry.comparison.eligible)
        .map((entry) => ({
          wardrobeItemId: entry.candidate.id,
          reason: entry.comparison.reason ?? "ineligible",
        })),
      sourceType: chosen?.candidate.sourceType ?? ("live" as const),
    };
  });
  const selectedInventory = inventory.filter((item) =>
    planned.some((match) => match.wardrobeItemId === item.id),
  );
  const evidence = createEvidenceProjection({
    pieces,
    inventory: selectedInventory,
    preferences: context.preferences,
    occasion: context.occasion,
    sourceRevision: context.sourceRevision,
  });
  const response = await requestFashion({
    task: "wardrobe_match",
    schema: explainedMatchesSchema.extend({
      matches: z
        .array(
          explainedMatchesSchema.shape.matches.element.extend({
            pieceId: z.enum(pieces.map((piece) => piece.id)),
            explanation: evidence.schema,
          }),
        )
        .min(1)
        .max(24),
    }),
    context: {
      instruction:
        "Explain exactly the fixed outcomes supplied. Do not alter outcomes or select any other wardrobe item. Each whyThis evidence array must contain only integer evidenceCatalog keys, such as 1. Choose keys whose supplied values support the reason; do not output source, id or path objects and never invent evidence keys. The server expands these keys to canonical references. inputsUsed must use only allowedInputs. Include two to four concrete evidence-backed reasons, differences and uncertainty. Combined inventory deliberately compares all supplied workspace records, including saved candidates, archived rows and sample rows. A saved_candidate is not owned and may only be explained as a potential alternative; never imply it is available in the owned wardrobe. An archived owned item is intentionally included in combined mode, but do not describe it as active. Always identify sample inventory as synthetic. Explain these supplied ownership and archive differences when relevant; functional suitability remains mandatory.",
      evidenceCatalogColumns: ["key", "source", "id", "path", "value"],
      evidenceCatalog: evidence.providerCatalog,
      inventoryMode: context.inventoryMode ?? "live",
      matches: planned.map(({ piece, chosen, ...match }) => ({
        ...match,
        inspiration: projectRecommendationItem(piece),
        wardrobeItem: chosen
          ? projectRecommendationItem(chosen.candidate)
          : null,
      })),
      preferences: context.preferences,
      occasion: context.occasion,
      sourceRevision: context.sourceRevision,
      allowedInputs: evidence.allowedInputs,
    },
  });
  context.onProviderMetadata?.(response.metadata);
  if (
    response.data.matches.length !== planned.length ||
    new Set(response.data.matches.map((match) => match.pieceId)).size !==
      planned.length
  )
    throw new ApiError(
      "invalid_match_output",
      "Matching explanations did not cover the reviewed pieces.",
      502,
    );
  return planned.map((match) => {
    const explained = response.data.matches.find(
      (entry) => entry.pieceId === match.pieceId,
    );
    if (!explained)
      throw new ApiError(
        "invalid_match_output",
        "A matching explanation referenced an unknown piece.",
        502,
      );
    validateExplanation(
      explained.explanation,
      pieces,
      selectedInventory,
      context,
    );
    return {
      pieceId: match.pieceId,
      wardrobeItemId: match.wardrobeItemId,
      outcome: match.outcome,
      score: match.score,
      sharedAttributes: match.sharedAttributes,
      differences: match.differences,
      evidenceCoverage: match.evidenceCoverage,
      rejectedCandidates: match.rejectedCandidates,
      sourceType: match.sourceType,
      explanation: explained.explanation,
    };
  });
}
