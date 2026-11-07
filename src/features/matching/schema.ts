import { z } from "zod";
import { explanationSchema } from "@/lib/ai/fashion-schema";

export const explainedMatchesSchema = z.strictObject({
  matches: z
    .array(
      z.strictObject({ pieceId: z.uuid(), explanation: explanationSchema }),
    )
    .min(1)
    .max(24),
});

export const matchResultSchema = z
  .strictObject({
    pieceId: z.uuid(),
    wardrobeItemId: z.uuid().nullable(),
    outcome: z.enum(["owned_match", "wardrobe_alternative", "missing"]),
    score: z.number().min(0).max(1).nullable(),
    sharedAttributes: z.array(z.string()),
    differences: z.array(z.string()),
    evidenceCoverage: z.number().min(0).max(1),
    rejectedCandidates: z.array(
      z.strictObject({ wardrobeItemId: z.uuid(), reason: z.string() }),
    ),
    explanation: explanationSchema,
    sourceType: z.enum(["live", "manual", "sample"]),
  })
  .superRefine((match, context) => {
    if ((match.outcome === "missing") !== (match.wardrobeItemId === null))
      context.addIssue({
        code: "custom",
        path: ["wardrobeItemId"],
        message: "Missing outcomes have no owned wardrobe reference.",
      });
  });

export type MatchResult = z.infer<typeof matchResultSchema>;
