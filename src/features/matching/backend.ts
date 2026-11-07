import "server-only";
import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api";
import {
  attributesSchema,
  categorySchema,
  explanationSchema,
} from "@/lib/ai/fashion-schema";
import { requestFashion } from "@/lib/ai/provider";
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import { z } from "zod";
import {
  evaluateCandidate,
  resolveEffectiveAttributes,
  type MatchItem,
} from "./gates";
import { explainedMatchesSchema, type MatchResult } from "./schema";

export type { MatchItem } from "./gates";
export type MatchContext = {
  preferences: Record<string, string | string[]>;
  occasion: string | null;
  sourceRevision: number;
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
  inventory_status: z.literal("owned"),
  archived_at: z.null(),
});

export async function listInventory(mode: "sample" | "live") {
  const { client, workspaceId } = getWorkspaceDatabase();
  let query = client
    .from("wardrobe_items")
    .select(
      "id,name,description,confidence,uncertainty,category,subcategory,attributes,inferred_attributes,corrections,provenance,source_type,revision,asset_id,inventory_status,archived_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("inventory_status", "owned")
    .is("archived_at", null);
  query =
    mode === "sample"
      ? query.eq("source_type", "sample")
      : query.neq("source_type", "sample");
  const { data, error } = await query.order("id");
  if (error)
    throw new ApiError(
      "inventory_read_failed",
      "Wardrobe matching is unavailable. Try again.",
      503,
      true,
    );
  const items: MatchItem[] = (data ?? []).map((row) => {
    const parsed = inventoryRowSchema.parse(row);
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
  for (const reason of explanation.whyThis)
    for (const evidence of reason.evidence) {
      if (
        (evidence.source === "preference" || evidence.source === "context") &&
        evidence.id !== null
      )
        throw new ApiError(
          "invalid_explanation_evidence",
          "The recommendation included an unsupported context reference.",
          502,
        );
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
        throw new ApiError(
          "invalid_explanation_evidence",
          "The recommendation included unsupported evidence.",
          502,
        );
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
        ),
      }))
      .sort(
        (left, right) =>
          right.comparison.score - left.comparison.score ||
          left.candidate.id.localeCompare(right.candidate.id),
      );
    const chosen = ranked.find((entry) => entry.comparison.eligible);
    return {
      piece,
      chosen,
      pieceId: piece.id,
      wardrobeItemId: chosen?.candidate.id ?? null,
      outcome: chosen
        ? chosen.comparison.score >= 0.8 &&
          chosen.comparison.evidenceCoverage >= 0.25
          ? ("owned_match" as const)
          : ("wardrobe_alternative" as const)
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
  const response = await requestFashion({
    task: "wardrobe_match",
    schema: explainedMatchesSchema,
    context: {
      instruction:
        "Explain exactly the fixed outcomes supplied. Do not alter outcomes or select any other wardrobe item. Evidence paths must resolve to supplied values (such as name, subcategory, attributes.primaryColor). Preference and context evidence IDs are null. inputsUsed must use only allowedInputs. Include two to four concrete evidence-backed reasons, differences and uncertainty. Sample wardrobe is explicitly synthetic, while inference is real.",
      matches: planned.map(({ piece, chosen, ...match }) => ({
        ...match,
        inspiration: piece,
        wardrobeItem: chosen?.candidate ?? null,
      })),
      preferences: context.preferences,
      occasion: context.occasion,
      sourceRevision: context.sourceRevision,
      allowedInputs: [
        "inspiration",
        ...(selectedInventory.length ? ["wardrobe"] : []),
        ...(context.occasion ? ["occasion"] : []),
        ...Object.keys(context.preferences),
      ],
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
