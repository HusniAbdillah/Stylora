"use client";

import { z } from "zod";
import { createPreviewStore } from "@/lib/preview/store";
import type {
  WardrobeCategory,
  WardrobeField,
  InventoryStatus,
} from "./wardrobe-types";

const wardrobeFieldSchema = z.strictObject({
  key: z.string().min(1).max(80),
  label: z.string().min(1).max(80),
  value: z.string().max(500),
  source: z
    .enum(["user", "visual_inference", "catalog", "derived", "sample"])
    .optional(),
  editable: z.boolean().optional(),
});

const wardrobeRecordSchema = z.strictObject({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(160),
  category: z.enum([
    "top",
    "bottom",
    "dress",
    "outerwear",
    "shoes",
    "accessory",
  ]),
  subcategory: z.string().max(100).nullable().optional(),
  inventoryStatus: z.enum(["owned", "saved_candidate"]),
  imageUrl: z.string().max(2000),
  imageKey: z.string().min(1).max(200).optional(),
  fields: z.array(wardrobeFieldSchema).max(32),
  sourceName: z.string().max(120).nullable().optional(),
  priceWhenSaved: z.string().max(80).nullable().optional(),
  archivedAt: z.string().nullable().optional(),
  createdAt: z.string().min(1),
  isSample: z.boolean(),
  usedIn: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(100),
        title: z.string().min(1).max(160),
        imageUrls: z.array(z.string().max(2000)).max(3),
      }),
    )
    .max(20)
    .optional(),
});

export type WardrobePreviewRecord = {
  id: string;
  name: string;
  category: WardrobeCategory;
  subcategory?: string | null;
  inventoryStatus: InventoryStatus;
  imageUrl: string;
  imageKey?: string;
  fields: WardrobeField[];
  sourceName?: string | null;
  priceWhenSaved?: string | null;
  archivedAt?: string | null;
  createdAt: string;
  isSample: boolean;
  usedIn?: Array<{ id: string; title: string; imageUrls: string[] }>;
};

const sampleImage = "/design/images/wardrobe-ivory-shirt.webp";
const sampleDate = "2026-11-07T00:00:00.000Z";

const sampleRecords: WardrobePreviewRecord[] = [
  {
    id: "sample-owned-ivory-shirt",
    name: "Ivory relaxed shirt",
    category: "top",
    subcategory: "Button-front shirt",
    inventoryStatus: "owned",
    imageUrl: sampleImage,
    fields: [
      { key: "color", label: "Color", value: "Ivory", source: "sample" },
      {
        key: "silhouette",
        label: "Silhouette",
        value: "Relaxed shirt",
        source: "sample",
      },
    ],
    createdAt: sampleDate,
    isSample: true,
  },
  {
    id: "sample-candidate-ivory-shirt",
    name: "Oxblood tote",
    category: "accessory",
    subcategory: "Tote",
    inventoryStatus: "saved_candidate",
    imageUrl: sampleImage,
    fields: [
      { key: "color", label: "Color", value: "Oxblood", source: "sample" },
    ],
    sourceName: "Sample catalog",
    createdAt: sampleDate,
    isSample: true,
  },
  {
    id: "sample-owned-trousers",
    name: "Charcoal wide-leg trousers",
    category: "bottom",
    subcategory: "Trousers",
    inventoryStatus: "owned",
    imageUrl: sampleImage,
    fields: [
      { key: "color", label: "Color", value: "Charcoal", source: "sample" },
    ],
    createdAt: sampleDate,
    isSample: true,
  },
  {
    id: "sample-owned-loafers",
    name: "Dark leather loafers",
    category: "shoes",
    subcategory: "Loafers",
    inventoryStatus: "owned",
    imageUrl: sampleImage,
    fields: [
      { key: "color", label: "Color", value: "Dark brown", source: "sample" },
    ],
    createdAt: sampleDate,
    isSample: true,
  },
  {
    id: "sample-owned-dress",
    name: "Floral day dress",
    category: "dress",
    subcategory: "Day dress",
    inventoryStatus: "owned",
    imageUrl: sampleImage,
    fields: [
      { key: "pattern", label: "Pattern", value: "Floral", source: "sample" },
    ],
    createdAt: sampleDate,
    isSample: true,
  },
  {
    id: "sample-owned-hoodie",
    name: "Navy zip hoodie",
    category: "outerwear",
    subcategory: "Hoodie",
    inventoryStatus: "owned",
    imageUrl: sampleImage,
    fields: [{ key: "color", label: "Color", value: "Navy", source: "sample" }],
    createdAt: sampleDate,
    isSample: true,
  },
  {
    id: "sample-archived-ivory-shirt",
    name: "Ivory Oxford shirt",
    category: "top",
    subcategory: "Button-front shirt",
    inventoryStatus: "owned",
    imageUrl: sampleImage,
    fields: [
      { key: "color", label: "Color", value: "Ivory", source: "sample" },
    ],
    archivedAt: sampleDate,
    createdAt: sampleDate,
    isSample: true,
  },
];

export const wardrobePreviewStore = createPreviewStore<WardrobePreviewRecord[]>(
  "wardrobe.items",
  sampleRecords,
  (value) => wardrobeRecordSchema.array().safeParse(value).success,
);

export type WardrobeCounts = {
  activeOwned: number;
  savedCandidates: number;
  archived: number;
  totalActive: number;
};

export function countWardrobeRecords(
  records: readonly WardrobePreviewRecord[],
): WardrobeCounts {
  const counts: WardrobeCounts = {
    activeOwned: 0,
    savedCandidates: 0,
    archived: 0,
    totalActive: 0,
  };
  for (const item of records) {
    if (item.archivedAt) {
      counts.archived += 1;
    } else {
      counts.totalActive += 1;
      if (item.inventoryStatus === "owned") counts.activeOwned += 1;
      else counts.savedCandidates += 1;
    }
  }
  return counts;
}

export function useWardrobeCounts(): WardrobeCounts {
  return countWardrobeRecords(wardrobePreviewStore.useValue());
}
