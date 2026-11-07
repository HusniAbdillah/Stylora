import { z } from "zod";
import { preferencesDraftSchema } from "../preferences/schema";

export const draftFeatureSchema = z.enum([
  "inspiration",
  "preferences",
  "profile",
]);
export const createSteps = [
  "upload",
  "review",
  "matches",
  "ideas",
  "details",
] as const;
const stepSchema = z.enum(createSteps);
const draftText = z.string().max(600);
const pieceDraftSchema = z.strictObject({
  id: z.uuid().optional(),
  name: z.string().max(160).optional(),
  category: z
    .enum(["top", "bottom", "dress", "outerwear", "shoes", "accessory"])
    .optional(),
  colors: draftText.optional(),
  apparentMaterial: draftText.optional(),
  pattern: draftText.optional(),
  texture: draftText.optional(),
  fit: draftText.optional(),
  cut: draftText.optional(),
  length: draftText.optional(),
  occasion: draftText.optional(),
  styleTags: draftText.optional(),
});

export const inspirationDraftPayloadSchema = z.strictObject({
  occasion: z.string().max(120).nullable().optional(),
  activePieceId: z.uuid().nullable().optional(),
  pieceDraft: pieceDraftSchema.nullable().optional(),
});
export const profileDraftPayloadSchema = z.strictObject({
  displayName: z.string().max(80).nullable().optional(),
});

export function parseDraftPayload(
  featureKind: z.infer<typeof draftFeatureSchema>,
  payload: unknown,
) {
  if (featureKind === "preferences")
    return preferencesDraftSchema.parse(payload);
  if (featureKind === "profile")
    return profileDraftPayloadSchema.parse(payload);
  return inspirationDraftPayloadSchema.parse(payload);
}

export const createDraftSchema = z
  .strictObject({
    featureKind: draftFeatureSchema,
    lookId: z.uuid().nullable().optional(),
    assetId: z.uuid().nullable().optional(),
    payload: z.unknown().optional(),
  })
  .superRefine((input, context) => {
    if (
      input.featureKind !== "inspiration" &&
      (input.lookId || input.assetId)
    ) {
      context.addIssue({
        code: "custom",
        message: "Only inspiration drafts accept image and look references.",
      });
    }
  });

export const patchDraftSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  lookId: z.uuid().nullable().optional(),
  assetId: z.uuid().nullable().optional(),
  payload: z.unknown().optional(),
  currentStep: stepSchema.nullable().optional(),
  visitedSteps: z
    .array(stepSchema)
    .max(5)
    .refine((steps) => new Set(steps).size === steps.length)
    .optional(),
  status: z.enum(["active", "completed", "discarded"]).optional(),
});

export function availableCreateSteps(
  verified: boolean,
  lookStatus: string | null,
) {
  if (!verified) return createSteps.slice(0, 1);
  let maximum = 0;
  if (verified && lookStatus) maximum = 1;
  if (
    ["analyzed", "reviewed", "matched", "options_ready"].includes(
      lookStatus ?? "",
    )
  )
    maximum = 2;
  if (["matched", "options_ready"].includes(lookStatus ?? "")) maximum = 3;
  if (lookStatus === "options_ready") maximum = 4;
  return createSteps.slice(0, maximum + 1);
}
