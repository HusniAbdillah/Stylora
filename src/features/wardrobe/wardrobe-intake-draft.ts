"use client";

import { z } from "zod";
import { createPreviewStore } from "@/lib/preview/store";
import type { WardrobeField } from "./wardrobe-types";

const fieldSchema = z.object({
  key: z.string().min(1).max(80),
  label: z.string().min(1).max(80),
  value: z.string().max(500),
  source: z
    .enum(["user", "visual_inference", "catalog", "derived", "sample"])
    .optional(),
  editable: z.boolean().optional(),
});
const draftSchema = z.object({
  status: z.enum(["empty", "photo_ready", "manual", "sample", "added"]),
  itemId: z.string().max(100).optional(),
  imageKey: z.string().max(200).optional(),
  imageUrl: z.string().max(2000).optional(),
  name: z.string().max(160),
  category: z.enum([
    "top",
    "bottom",
    "dress",
    "outerwear",
    "shoes",
    "accessory",
  ]),
  fields: z.array(fieldSchema).max(32),
  isSample: z.boolean(),
});

export type IntakeDraft = z.infer<typeof draftSchema>;

export const emptyDraft: IntakeDraft = {
  status: "empty",
  name: "",
  category: "top",
  fields: [],
  isSample: false,
};

const intakeFieldLabels = [
  ["color", "Colors"],
  ["pattern", "Pattern"],
  ["texture", "Fabric look"],
  ["silhouette", "Silhouette and fit"],
  ["length", "Length"],
  ["necklineSleeve", "Neckline and sleeve"],
  ["occasion", "Occasion"],
] as const;

export function getIntakeFields(fields: WardrobeField[] = []): WardrobeField[] {
  return intakeFieldLabels.map(([key, label]) => {
    const field = fields.find((candidate) => candidate.key === key);
    return { value: "", ...field, key, label };
  });
}

export function sampleDraft(): IntakeDraft {
  return {
    status: "sample",
    itemId: crypto.randomUUID(),
    imageUrl: "/design/images/wardrobe-ivory-shirt.webp",
    name: "Ivory relaxed shirt",
    category: "top",
    fields: getIntakeFields([
      { key: "color", label: "Colors", value: "Ivory", source: "sample" },
      {
        key: "silhouette",
        label: "Silhouette and fit",
        value: "Relaxed button-front shirt",
        source: "sample",
      },
    ]),
    isSample: true,
  };
}

export const wardrobeIntakeDraftStore = createPreviewStore<IntakeDraft>(
  "wardrobe-intake-draft",
  emptyDraft,
  (value) => draftSchema.safeParse(value).success,
);
