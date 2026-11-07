import "server-only";
import { ApiError } from "@/lib/api";
import { requestFashion } from "@/lib/ai/provider";
import {
  validateExplanation,
  type MatchContext,
} from "@/features/matching/backend";
import type { MatchItem } from "@/features/matching/gates";
import type { MatchResult } from "@/features/matching/schema";
import {
  outfitOptionsSchema,
  validateOptionComposition,
  type OutfitOption,
  type OutfitOptionType,
} from "./schema";

export type GenerateOptionsInput = MatchContext & {
  pieces: MatchItem[];
  matches: MatchResult[];
  inventory: MatchItem[];
  optionType?: OutfitOptionType;
};

export async function generateOptions(
  input: GenerateOptionsInput,
): Promise<OutfitOption[]> {
  if (
    !input.pieces.length ||
    input.matches.length !== input.pieces.length ||
    input.pieces.some(
      (piece) => !input.matches.some((match) => match.pieceId === piece.id),
    )
  )
    throw new ApiError(
      "matches_not_ready",
      "Complete wardrobe matching before generating outfit ideas.",
      409,
    );
  const response = await requestFashion({
    task: input.optionType ? "option_regeneration" : "outfit_options",
    schema: outfitOptionsSchema,
    context: {
      instruction:
        "Generate exactly the requested types. Use distinct wearable compositions, not only different titles. Every ready option needs a dress or top and bottom; include shoes when the reference contains them. Do not combine a one-piece dress and unrelated bottom. Use only allowed inventory IDs; no duplicate physical item. from_wardrobe uses only owned items; if inventory cannot support clothing coverage or required footwear, return that direction unavailable with empty items and an honest explanation. Other types may include structured missing briefs using garment schema plus schemaVersion fashion-item.v1, never invented owned IDs. slotId is a stable lowercase semantic name such as top_1, bottom_1, shoes_1. Missing brief fields describe proposed garments, not observed catalog facts; label derived context. closest preserves defining reference details; fresh_alternative changes palette, silhouette, or style. Preserve explicit practical constraints and supplied preferences. Provide two to four evidence-backed reasons; evidence paths resolve to actual supplied values, with preference/context IDs null. Use only allowedInputs; sourceRevision must match. Wardrobe sourceType sample means the inventory is synthetic and must remain explicit.",
      requestedTypes: input.optionType
        ? [input.optionType]
        : ["closest", "from_wardrobe", "fresh_alternative"],
      pieces: input.pieces,
      matches: input.matches,
      inventory: input.inventory,
      preferences: input.preferences,
      occasion: input.occasion,
      sourceRevision: input.sourceRevision,
      allowedInputs: [
        "inspiration",
        ...(input.inventory.length ? ["wardrobe"] : []),
        ...(input.occasion ? ["occasion"] : []),
        ...Object.keys(input.preferences),
      ],
    },
  });
  input.onProviderMetadata?.(response.metadata);
  const errors = validateOptionComposition(
    response.data.options,
    input.pieces,
    input.inventory,
    input.optionType,
    { preferences: input.preferences, occasion: input.occasion },
  );
  if (errors.length)
    throw new ApiError(
      "invalid_outfit_composition",
      `Outfit validation failed (${errors.join(", ")}).`,
      502,
    );
  for (const option of response.data.options)
    validateExplanation(
      option.explanation,
      input.pieces,
      input.inventory,
      input,
    );
  return response.data.options;
}
