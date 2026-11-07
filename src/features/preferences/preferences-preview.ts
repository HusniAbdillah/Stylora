"use client";

import { z } from "zod";
import { createPreviewStore } from "@/lib/preview/store";
import {
  menBodyIllustrations,
  skinSwatchOptions,
  womenBodyIllustrations,
  type PreferencesDraft,
} from "./preferences-types";

const choice = z.string().min(1).max(80).nullable().optional();
const choices = z.array(z.string().min(1).max(80)).max(30).optional();
const draftSchema = z
  .strictObject({
    skinSwatchId: choice,
    skinSwatchHex: choice,
    undertone: choice,
    contrast: choice,
    bodyIllustrationGroup: z.enum(["women", "men"]).nullable().optional(),
    bodyIllustrationId: choice,
    fit: choice,
    proportions: choices,
    styles: choices,
    colorFamilies: choices,
    occasions: choices,
    climate: choices,
    coverage: choices,
    lengths: choices,
    layering: choices,
    fabricDislikes: choices,
    footwearComfort: choices,
    careTolerance: choices,
  })
  .superRefine((draft, context) => {
    const swatch = skinSwatchOptions.find(
      (option) => option.id === draft.skinSwatchId,
    );
    if (
      (draft.skinSwatchId && swatch?.hex !== draft.skinSwatchHex) ||
      (!draft.skinSwatchId && draft.skinSwatchHex)
    ) {
      context.addIssue({
        code: "custom",
        path: ["skinSwatchHex"],
        message: "Skin swatch ID and color must match",
      });
    }
    const illustrations =
      draft.bodyIllustrationGroup === "women"
        ? womenBodyIllustrations
        : draft.bodyIllustrationGroup === "men"
          ? menBodyIllustrations
          : [];
    if (
      (draft.bodyIllustrationId &&
        !illustrations.some(
          (option) => option.id === draft.bodyIllustrationId,
        )) ||
      (!draft.bodyIllustrationId && draft.bodyIllustrationGroup)
    ) {
      context.addIssue({
        code: "custom",
        path: ["bodyIllustrationId"],
        message: "Body illustration and group must match",
      });
    }
  });

const preferencesStateSchema = z.strictObject({
  draft: draftSchema,
  saved: draftSchema,
  revision: z.number().int().nonnegative(),
});

export type PreferencesState = {
  draft: PreferencesDraft;
  saved: PreferencesDraft;
  revision: number;
};

export const preferencesPreviewStore = createPreviewStore<PreferencesState>(
  "preferences",
  { draft: {}, saved: {}, revision: 0 },
  (value) => preferencesStateSchema.safeParse(value).success,
);

export function useSavedPreferences(): PreferencesDraft {
  return preferencesPreviewStore.useValue().saved;
}

export function usePreferenceRevision(): number {
  return preferencesPreviewStore.useValue().revision;
}
