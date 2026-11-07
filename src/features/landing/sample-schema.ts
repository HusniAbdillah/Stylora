import { z } from "zod";
import {
  canonicalDescriptionSchema,
  confidenceSchema,
  descriptionSchema,
} from "../../lib/ai/fashion-schema";

export const landingSampleOutputSchema = z.strictObject({
  description: descriptionSchema,
  confidence: confidenceSchema,
  ideas: z
    .array(
      z.strictObject({
        direction: z.enum(["closest", "from_wardrobe", "fresh_alternative"]),
        title: z.string().min(1).max(160),
        reasons: z.array(z.string().min(1).max(400)).min(2).max(4),
        differences: z.array(z.string().min(1).max(400)).max(6),
        uncertainty: z.array(z.string().min(1).max(400)).max(6),
      }),
    )
    .length(3),
});

// The stored description is already canonical; the provider projection transforms it once.
export const storedLandingSampleSchema = z.object({
  description: canonicalDescriptionSchema,
  confidence: confidenceSchema,
  ideas: landingSampleOutputSchema.shape.ideas,
  wardrobe: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      category: z.string(),
      assetId: z.uuid().nullable(),
      attributes: z.record(z.string(), z.unknown()),
    }),
  ),
});
