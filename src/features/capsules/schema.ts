import { z } from "zod";

export const categorySchema = z.enum([
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoes",
  "accessory",
]);
const ids = z
  .array(z.uuid())
  .max(60)
  .refine((values) => new Set(values).size === values.length);
const choice = z.string().trim().max(120).nullable();
export const capsuleBriefSchema = z
  .strictObject({
    templateId: z
      .enum([
        "everyday-ease",
        "modern-workweek",
        "weekend-travel",
        "warm-weather",
        "evening",
      ])
      .nullable(),
    days: z.number().int().min(1).max(30),
    targetOutfits: z.number().int().min(3).max(6),
    activities: z.array(z.string().trim().min(1).max(120)).max(12),
    weather: choice,
    laundry: choice,
    notes: z.string().max(2000),
    palette: choice,
    dressCode: choice,
    luggage: choice,
    footwear: choice,
    coverage: choice,
    care: choice,
    includedItemIds: ids,
    requiredItemIds: ids,
    excludedItemIds: ids,
  })
  .superRefine((brief, context) => {
    if (
      brief.requiredItemIds.some((id) => !brief.includedItemIds.includes(id)) ||
      brief.excludedItemIds.some((id) => brief.includedItemIds.includes(id))
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Required items must be included and excluded items must be separate.",
      });
    }
  });

export const draftInputSchema = z
  .strictObject({
    expectedRevision: z.number().int().min(0),
    brief: capsuleBriefSchema,
    step: z.number().int().min(0).max(3),
    visited: z.number().int().min(0).max(3),
    capsuleId: z.uuid().optional(),
    capsuleRevision: z.number().int().positive().optional(),
  })
  .refine((draft) => draft.step <= draft.visited)
  .refine(
    (draft) => Boolean(draft.capsuleId) === Boolean(draft.capsuleRevision),
  );

export type CapsuleDraftState = {
  id: string;
  revision: number;
  brief: z.infer<typeof capsuleBriefSchema>;
  step: 0 | 1 | 2 | 3;
  visited: number;
  capsuleId?: string;
  capsuleRevision?: number;
};
