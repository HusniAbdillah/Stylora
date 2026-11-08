import "server-only";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import {
  canonicalDescriptionSchema,
  confidenceOutputSchema,
  garmentSchema,
  garmentProvenance,
  observationSchema,
} from "@/lib/ai/fashion-schema";
import {
  validateExplanation,
  type MatchContext,
} from "@/features/matching/backend";
import {
  evaluateCandidate,
  classifyInventoryMatch,
  type MatchItem,
} from "@/features/matching/gates";
import { matchResultSchema } from "@/features/matching/schema";
import {
  outfitOptionsSchema,
  outfitOptionSchema,
  outfitItemSchema,
  validateOptionComposition,
  type OutfitOptionType,
} from "@/features/outfits/schema";
import type { CreateKind } from "./create-policy";

const provenanceSchema = z.record(
  z.string(),
  observationSchema.omit({ path: true }).extend({
    assetId: z.uuid().nullable(),
    provider: z.literal("openai"),
    model: z.string().min(1),
  }),
);
const pieceSchema = garmentSchema.safeExtend({
  id: z.uuid(),
  position: z.number().int().nonnegative(),
  provenance: provenanceSchema,
});
const persistedOptionsSchema = outfitOptionsSchema.extend({
  options: z
    .array(
      outfitOptionSchema.extend({
        sourceType: z.enum(["sample", "live"]),
        items: z
          .array(
            outfitItemSchema.extend({
              position: z.number().int().nonnegative(),
            }),
          )
          .max(12),
      }),
    )
    .min(1)
    .max(3),
});

type ResultContext = MatchContext & {
  kind: CreateKind;
  assetId: string;
  model: string;
  pieces: MatchItem[];
  inventory: MatchItem[];
  optionType?: OutfitOptionType;
};

function invalid() {
  return new ApiError(
    "operation_checkpoint_invalid",
    "The saved analysis result did not pass validation. Start a new analysis.",
    502,
    false,
  );
}

export function validateCreateResult(
  value: unknown,
  context: ResultContext,
): void {
  if (context.kind === "inspiration_description") {
    const { pieces } = z
      .strictObject({ pieces: z.array(pieceSchema).min(1).max(24) })
      .parse(value);
    canonicalDescriptionSchema.parse({
      pieces: pieces.map((piece) => ({
        name: piece.name,
        category: piece.category,
        subcategory: piece.subcategory,
        description: piece.description,
        attributes: piece.attributes,
        observations: piece.observations,
        confidence: piece.confidence,
        uncertainty: piece.uncertainty,
      })),
    });
    if (
      new Set(pieces.map((piece) => piece.id)).size !== pieces.length ||
      pieces.some(
        (piece, index) =>
          piece.position !== index ||
          !isDeepStrictEqual(
            piece.provenance,
            garmentProvenance(piece, context.assetId, context.model),
          ),
      )
    )
      throw invalid();
    return;
  }
  if (context.kind === "inspiration_confidence") {
    confidenceOutputSchema({
      assetId: context.assetId,
      sourceRevision: context.sourceRevision,
      preferenceKeys: Object.keys(context.preferences),
      hasOccasion: Boolean(context.occasion),
    }).parse(value);
    return;
  }
  if (context.kind === "wardrobe_match") {
    const { matches } = z
      .strictObject({ matches: z.array(matchResultSchema).min(1).max(24) })
      .parse(value);
    if (
      matches.length !== context.pieces.length ||
      new Set(matches.map((match) => match.pieceId)).size !==
        context.pieces.length
    )
      throw invalid();
    for (const match of matches) {
      const piece = context.pieces.find((item) => item.id === match.pieceId);
      const item = context.inventory.find(
        (item) => item.id === match.wardrobeItemId,
      );
      if (!piece || (match.wardrobeItemId && !item)) throw invalid();
      if (item) {
        const comparison = evaluateCandidate(
          piece,
          item,
          context.occasion,
          context.preferences,
          context.inventoryMode,
        );
        if (
          !comparison.eligible ||
          classifyInventoryMatch(item, comparison) !== match.outcome
        )
          throw invalid();
      }
      validateExplanation(
        match.explanation,
        context.pieces,
        context.inventory,
        context,
      );
    }
    return;
  }
  const { options } = persistedOptionsSchema.parse(value);
  if (
    validateOptionComposition(
      options,
      context.pieces,
      context.inventory,
      context.optionType,
      context,
    ).length ||
    options.some(
      (option) =>
        option.sourceType !==
          (context.inventoryMode === "sample" ? "sample" : "live") ||
        option.items.some((item, index) => item.position !== index),
    )
  )
    throw invalid();
  for (const option of options)
    validateExplanation(
      option.explanation,
      context.pieces,
      context.inventory,
      context,
    );
}
