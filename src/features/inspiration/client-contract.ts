import { z } from "zod";
import {
  garmentSchema,
  confidenceSchema,
  explanationSchema,
} from "@/lib/ai/fashion-schema";
import { settingsRequest } from "@/features/preferences/client-contract";

export const stepKeys = [
  "upload",
  "review",
  "matches",
  "ideas",
  "details",
] as const;
export type CreateStep = (typeof stepKeys)[number];
export const operationSchema = z
  .object({
    id: z.uuid(),
    kind: z.string(),
    status: z.enum([
      "queued",
      "running",
      "partial",
      "succeeded",
      "failed",
      "cancelled",
      "superseded",
    ]),
    inputRevision: z.number().int().positive(),
    inventoryMode: z
      .enum(["live", "sample", "combined"])
      .nullable()
      .default(null),
    errorCode: z.string().nullable(),
    assetId: z.uuid().nullable().optional(),
    runtimeVersion: z.string().nullable().optional(),
    currentRuntimeVersion: z.string().optional(),
    canRetry: z.boolean().default(false),
    canRestart: z.boolean().default(false),
    retryBlockedReason: z.string().nullable().optional(),
    optionType: z
      .enum(["closest", "from_wardrobe", "fresh_alternative"])
      .nullable()
      .optional(),
    subjectId: z.uuid().optional(),
  })
  .passthrough();
const imageSchema = z
  .object({
    assetId: z.uuid(),
    url: z.string().nullable(),
    status: z.string(),
    expiresIn: z.number(),
  })
  .nullable();
const wardrobeItemSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    sourceType: z.string(),
    inventoryStatus: z.enum(["owned", "saved_candidate"]).optional(),
    archivedAt: z.string().nullable().optional(),
    image: imageSchema,
  })
  .nullable();
export const canonicalPieceSchema = garmentSchema
  .safeExtend({
    id: z.uuid(),
    revision: z.number().int().positive(),
    position: z.number(),
    sourceType: z.enum(["live", "manual", "sample"]),
    provenance: z.record(z.string(), z.json()),
    corrections: z.record(z.string(), z.json()),
  })
  .passthrough();
export const lookSchema = z.object({
  activeDraftId: z.uuid().nullable().optional(),
  inventoryMode: z
    .enum(["live", "sample", "combined"])
    .nullable()
    .default(null),
  id: z.uuid(),
  title: z.string(),
  occasion: z.string().nullable(),
  revision: z.number().int().positive(),
  status: z.string(),
  sourceType: z.string(),
  inspirationImage: imageSchema,
  pieces: z.array(canonicalPieceSchema),
  confidenceReview: confidenceSchema
    .extend({ id: z.uuid(), stale: z.boolean(), sourceRevision: z.number() })
    .passthrough()
    .nullable(),
  matches: z.array(
    z
      .object({
        id: z.uuid(),
        pieceId: z.uuid(),
        outcome: z.enum(["owned_match", "wardrobe_alternative", "missing"]),
        inventoryMode: z
          .enum(["live", "sample", "combined"])
          .nullable()
          .default(null),
        wardrobeItem: wardrobeItemSchema,
        explanation: explanationSchema,
        sharedAttributes: z.json(),
        differences: z.json(),
        rejectedCandidates: z.json(),
        stale: z.boolean(),
        sourceType: z.string(),
      })
      .passthrough(),
  ),
  outfitOptions: z.array(
    z
      .object({
        id: z.uuid(),
        optionType: z.enum(["closest", "from_wardrobe", "fresh_alternative"]),
        inventoryMode: z
          .enum(["live", "sample", "combined"])
          .nullable()
          .default(null),
        title: z.string(),
        concept: z.string(),
        explanation: explanationSchema,
        status: z.enum(["ready", "unavailable"]),
        stale: z.boolean(),
        revision: z.number(),
        items: z.array(
          z
            .object({
              id: z.uuid(),
              slotId: z.string(),
              category: z.string(),
              itemKind: z.string(),
              pieceId: z.uuid().nullable(),
              wardrobeItem: wardrobeItemSchema,
              missingBrief: z.json().nullable(),
              rationale: z.string(),
              revision: z.number(),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  ),
  operations: z.array(operationSchema),
  marketplaceIntegration: z.literal("pending"),
});
export const inspirationPayloadSchema = z.object({
  occasion: z.string().nullable().optional(),
  activePieceId: z.uuid().nullable().optional(),
  pieceDraft: z
    .object({
      id: z.uuid().optional(),
      name: z.string().optional(),
      category: z
        .enum(["top", "bottom", "dress", "outerwear", "shoes", "accessory"])
        .optional(),
      colors: z.string().optional(),
      apparentMaterial: z.string().optional(),
      pattern: z.string().optional(),
      texture: z.string().optional(),
      fit: z.string().optional(),
      cut: z.string().optional(),
      length: z.string().optional(),
      occasion: z.string().optional(),
      styleTags: z.string().optional(),
    })
    .nullable()
    .optional(),
});
export const draftSchema = z.object({
  id: z.uuid(),
  featureKind: z.literal("inspiration"),
  lookId: z.uuid().nullable(),
  assetId: z.uuid().nullable(),
  currentStep: z.enum(stepKeys).nullable(),
  visitedSteps: z.array(z.enum(stepKeys)),
  payload: inspirationPayloadSchema,
  status: z.enum(["active", "completed", "discarded"]),
  revision: z.number().int().positive(),
});
export const eventsSchema = z.array(
  z
    .object({
      eventId: z.uuid(),
      sequence: z.number(),
      sourceRevision: z.number(),
      type: z.string(),
      payload: z.json(),
    })
    .passthrough(),
);
export type CreateLook = z.infer<typeof lookSchema>;
export type CanonicalPiece = z.infer<typeof canonicalPieceSchema>;
export type CreateDraft = z.infer<typeof draftSchema>;
export type CreateOperation = z.infer<typeof operationSchema>;
export const createRequest = settingsRequest;
