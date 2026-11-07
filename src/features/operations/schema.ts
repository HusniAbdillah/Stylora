import { z } from "zod";

export const operationKindSchema = z.enum([
  "inspiration_description",
  "inspiration_confidence",
  "wardrobe_match",
  "outfit_options",
  "option_regeneration",
  "marketplace_search",
  "wardrobe_description",
  "capsule_generation",
  "preview_image",
  "saved_avatar",
]);

export const operationStatusSchema = z.enum([
  "queued",
  "running",
  "partial",
  "succeeded",
  "failed",
  "cancelled",
  "superseded",
]);

export const startOperationSchema = z.strictObject({
  kind: operationKindSchema,
  subjectType: z.enum([
    "look",
    "outfit_option",
    "option_item",
    "capsule",
    "draft",
    "saved_look",
  ]),
  subjectId: z.uuid(),
  inputRevision: z.number().int().positive(),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  input: z.record(z.string(), z.json()),
  promptVersion: z.string().min(1).max(120),
  schemaVersion: z.string().min(1).max(120),
  model: z.string().min(1).max(120),
});

export const operationRowSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  kind: operationKindSchema,
  subject_type: startOperationSchema.shape.subjectType,
  subject_id: z.uuid(),
  status: operationStatusSchema,
  input_revision: z.number().int().positive(),
  input_fingerprint: startOperationSchema.shape.inputFingerprint,
  input: z.record(z.string(), z.json()),
  attempt_count: z.number().int().min(0).max(3),
  lease_until: z.iso.datetime({ offset: true }).nullable(),
  result_ref: z.record(z.string(), z.json()).nullable(),
  safe_error_code: z.string().nullable(),
  cancel_requested_at: z.iso.datetime({ offset: true }).nullable(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

const publicResultSchema = z.object({
  retryAfter: z.iso.datetime({ offset: true }).optional(),
  retryable: z.boolean().optional(),
  capsuleId: z.uuid().optional(),
  draftId: z.uuid().optional(),
  assetId: z.uuid().optional(),
  lookId: z.uuid().optional(),
  savedLookId: z.uuid().optional(),
  renderFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});

export type StartOperationInput = z.input<typeof startOperationSchema>;
export type Operation = z.infer<typeof operationRowSchema>;

export function operationStatus(operation: Operation) {
  return {
    id: operation.id,
    kind: operation.kind,
    subjectType: operation.subject_type,
    subjectId: operation.subject_id,
    inputRevision: operation.input_revision,
    status: operation.status,
    attemptCount: operation.attempt_count,
    leaseUntil: operation.lease_until,
    cancelRequested: operation.cancel_requested_at !== null,
    resultRef: operation.result_ref
      ? publicResultSchema.parse(operation.result_ref)
      : null,
    safeErrorCode: operation.safe_error_code,
    createdAt: operation.created_at,
    updatedAt: operation.updated_at,
  };
}

export type OperationStatus = ReturnType<typeof operationStatus>;
