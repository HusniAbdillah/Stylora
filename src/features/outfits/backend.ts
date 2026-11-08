import "server-only";
import { ApiError } from "@/lib/api";
import { fashionValidationFailure, requestFashion } from "@/lib/ai/provider";
import {
  validateExplanation,
  type MatchContext,
} from "@/features/matching/backend";
import {
  isOwnedInventoryItem,
  type MatchItem,
} from "@/features/matching/gates";
import type { MatchResult } from "@/features/matching/schema";
import {
  createEvidenceProjection,
  projectRecommendationIndex,
} from "@/features/matching/evidence";
import {
  validateOptionComposition,
  type OutfitOption,
  type OutfitOptionType,
} from "./schema";
import { outfitProviderSchema } from "./provider-schema";

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
  const evidence = createEvidenceProjection(input);
  const response = await requestFashion({
    task: input.optionType ? "option_regeneration" : "outfit_options",
    schema: outfitProviderSchema(input, evidence.schema),
    validate: ({ options }) => {
      const errors = validateOptionComposition(
        options,
        input.pieces,
        input.inventory,
        input.optionType,
        input,
      );
      if (errors.length)
        throw fashionValidationFailure(
          "invalid_outfit_composition",
          errors.map((code) => ({ code, path: "options" })),
        );
      for (const option of options)
        validateExplanation(
          option.explanation,
          input.pieces,
          input.inventory,
          input,
        );
    },
    context: {
      itemData:
        "Return options as an object with exactly the requested direction keys, not an array; each value describes that direction. The server attaches the corresponding optionType. The piece and inventory indexes carry identity and ownership. All populated canonical garment facts are supplied once in evidenceCatalog rows. For a missingBrief emit schemaVersion fashion-item.v1 and garment in the compact attribute-entry shape, with coreEvidence and attribute evidence source derived. The server maps this projection to canonical flat attributes; proposed briefs are not observed catalog garments.",
      instruction:
        "Generate exactly the requested types. Use distinct wearable compositions, not only different titles. Every ready option needs a dress or top and bottom; include shoes when the reference contains them. Do not combine a one-piece dress and unrelated bottom. Owned slots may use only allowedOwnedIds; no duplicate physical item. from_wardrobe uses only those owned items; if they cannot support clothing coverage or required footwear, return that direction unavailable with empty items and an honest explanation. Combined mode intentionally includes archived owned and sample owned rows in allowedOwnedIds. Name archive and sample limitations honestly. Saved candidates remain unowned: use them only as evidence or as inspiration for a structured missing brief, never in an owned slot and never in from_wardrobe. Other types may include structured missing briefs using garment schema plus schemaVersion fashion-item.v1, never invented owned IDs. slotId is a stable lowercase semantic name such as top_1, bottom_1, shoes_1. Missing brief fields describe proposed garments, not observed catalog facts; label derived context. closest preserves defining reference details; fresh_alternative changes palette, silhouette, or style. Preserve explicit practical constraints and supplied preferences. Provide two to four evidence-backed reasons. Each whyThis evidence array must contain only integer evidenceCatalog keys, such as 1, whose supplied values support the reason. The catalog rows follow evidenceCatalogColumns. Never invent keys or output source/id/path objects; the server expands keys to canonical references. Use only allowedInputs; sourceRevision must match. Wardrobe sourceType sample means the inventory is synthetic and must remain explicit.",
      evidenceCatalogColumns: ["key", "source", "id", "path", "value"],
      evidenceCatalog: evidence.providerCatalog,
      requestedTypes: input.optionType
        ? [input.optionType]
        : ["closest", "from_wardrobe", "fresh_alternative"],
      pieces: input.pieces.map(projectRecommendationIndex),
      matches: input.matches.map(
        ({
          pieceId,
          wardrobeItemId,
          outcome,
          sharedAttributes,
          differences,
        }) => ({
          pieceId,
          wardrobeItemId,
          outcome,
          sharedAttributes,
          differences,
        }),
      ),
      inventory: input.inventory.map(projectRecommendationIndex),
      inventoryMode: input.inventoryMode ?? "live",
      allowedOwnedIds: input.inventory
        .filter((item) => isOwnedInventoryItem(item, input.inventoryMode))
        .map((item) => item.id),
      preferences: input.preferences,
      occasion: input.occasion,
      sourceRevision: input.sourceRevision,
      allowedInputs: evidence.allowedInputs,
    },
  });
  input.onProviderMetadata?.(response.metadata);
  const errors = validateOptionComposition(
    response.data.options,
    input.pieces,
    input.inventory,
    input.optionType,
    {
      preferences: input.preferences,
      occasion: input.occasion,
      inventoryMode: input.inventoryMode,
    },
  );
  if (errors.length)
    throw fashionValidationFailure(
      "invalid_outfit_composition",
      errors.map((code) => ({ code, path: "options" })),
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
