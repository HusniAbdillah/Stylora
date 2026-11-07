import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
} from "@/lib/supabase/server";
import {
  createWorkspaceSignedRead,
  createWorkspaceSignedUpload,
  STORAGE_MAX_BYTES,
  verifyWorkspaceStorageAsset,
} from "@/lib/supabase/storage";
import {
  attributesSchema,
  categorySchema,
  compactAttributes,
  confidenceSchema,
  explanationSchema,
  FASHION_SCHEMA_VERSION,
  garmentSchema,
  observationSchema,
  type Garment,
} from "@/lib/ai/fashion-schema";
import type { Database } from "@/types/database";
import { getPersonalizationSnapshot } from "@/features/preferences/server";
import { listInventory } from "@/features/matching/backend";

type PieceRow = Database["public"]["Tables"]["inspiration_pieces"]["Row"];
const uuid = z.uuid();
const jsonRecord = z.record(z.string(), z.json());
const uploadRequestSchema = z.strictObject({
  fileName: z
    .string()
    .min(1)
    .max(255)
    .refine((name) => !/[\\/\u0000-\u001f]/.test(name)),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z.number().int().min(1).max(STORAGE_MAX_BYTES),
});
const verifyRequestSchema = z.strictObject({
  draftId: uuid,
  expectedRevision: z.number().int().positive(),
  occasion: z.string().trim().max(120).nullable().optional(),
});
const pieceEditSchema = garmentSchema.safeExtend({
  id: uuid.optional(),
  clearCorrections: z.array(z.string().min(1).max(160)).max(160).optional(),
});
const savePiecesSchema = z
  .strictObject({
    expectedRevision: z.number().int().positive(),
    pieces: z.array(pieceEditSchema).max(24),
  })
  .superRefine(({ pieces }, context) => {
    const ids = pieces.flatMap((piece) => (piece.id ? [piece.id] : []));
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        message: "Each garment ID may appear only once.",
      });
  });

function notFound(): never {
  throw new ApiError("look_not_found", "This inspiration is unavailable.", 404);
}

function rpcError(error: { message: string }) {
  if (/revision_conflict|stale_revision|revision conflict/i.test(error.message))
    throw new ApiError(
      "revision_conflict",
      "This inspiration changed. Reload it before saving again.",
      409,
    );
  if (/not_found|not found|not_active|unavailable/i.test(error.message))
    notFound();
  throw new ApiError(
    "inspiration_save_failed",
    "The inspiration could not be saved. Try again.",
    502,
    true,
  );
}

export async function createInspirationUpload(input: unknown) {
  const parsed = uploadRequestSchema.parse(input);
  const upload = await createWorkspaceSignedUpload({
    bucket: "inspiration",
    sourceType: "live",
    mimeType: parsed.mimeType,
    byteSize: parsed.byteSize,
  });
  return {
    assetId: upload.assetId,
    signedUrl: upload.signedUrl,
    mimeType: parsed.mimeType,
    byteSize: parsed.byteSize,
  };
}

export async function verifyInspirationUpload(assetId: string, input: unknown) {
  uuid.parse(assetId);
  const parsed = verifyRequestSchema.parse(input);
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const { data: draft, error: draftError } = await context.client
    .from("workflow_drafts")
    .select("id,feature_kind,status,revision")
    .eq("workspace_id", context.workspaceId)
    .eq("id", parsed.draftId)
    .maybeSingle();
  if (draftError)
    throw new ApiError(
      "draft_read_failed",
      "The upload draft could not be loaded.",
      502,
      true,
    );
  if (
    !draft ||
    draft.feature_kind !== "inspiration" ||
    draft.status !== "active"
  )
    notFound();
  if (draft.revision !== parsed.expectedRevision)
    throw new ApiError(
      "revision_conflict",
      "This upload draft changed. Reload it before continuing.",
      409,
    );
  const verified = await verifyWorkspaceStorageAsset(assetId);
  if (verified.bucket !== "inspiration") notFound();
  const { data, error } = await context.client.rpc(
    "attach_inspiration_upload",
    {
      p_workspace_id: context.workspaceId,
      p_asset_id: assetId,
      p_draft_id: parsed.draftId,
      p_expected_revision: parsed.expectedRevision,
      p_occasion: parsed.occasion || undefined,
    },
  );
  if (error) rpcError(error);
  const look = z
    .object({ id: uuid, revision: z.number().int().positive() })
    .parse(data);
  return { lookId: look.id, revision: look.revision, draftId: parsed.draftId };
}

export function toCanonicalPiece(row: PieceRow, assetId: string | null) {
  const provenance = jsonRecord.parse(row.provenance);
  const observations = Object.entries(provenance).map(([path, value]) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new ApiError(
        "piece_provenance_invalid",
        "This garment's evidence is unavailable.",
        500,
      );
    const observation = observationSchema.safeParse({
      path,
      source: value.source,
      state: value.state,
      confidence: value.confidence ?? null,
      evidence: value.evidence ?? "",
      uncertainty: value.uncertainty ?? null,
    });
    if (!observation.success)
      throw new ApiError(
        "piece_provenance_invalid",
        "This garment's evidence is unavailable.",
        500,
      );
    return observation.data;
  });
  const garment = garmentSchema.parse({
    name: row.name,
    category: row.category,
    subcategory: row.subcategory,
    description: row.description,
    attributes: row.attributes,
    observations,
    confidence: row.confidence,
    uncertainty: row.uncertainty,
  });
  return {
    ...garment,
    id: row.id,
    schemaVersion: FASHION_SCHEMA_VERSION,
    revision: row.revision,
    sourceType: z.enum(["live", "manual", "sample"]).parse(row.source_type),
    assetId,
    sourceReference: { kind: "inspiration_piece" as const, id: row.id },
    inventoryStatus: "not_applicable" as const,
    position: row.position,
    provenance,
    corrections: jsonRecord.parse(row.corrections),
  };
}

export async function getLookContext(lookId: string) {
  uuid.parse(lookId);
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data: look, error } = await client
    .from("looks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", lookId)
    .maybeSingle();
  if (error)
    throw new ApiError(
      "look_read_failed",
      "The inspiration could not be loaded.",
      502,
      true,
    );
  if (!look) notFound();
  const { data: pieces, error: piecesError } = await client
    .from("inspiration_pieces")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("look_id", lookId)
    .is("removed_at", null)
    .order("position");
  if (piecesError)
    throw new ApiError(
      "pieces_read_failed",
      "The garment descriptions could not be loaded.",
      502,
      true,
    );
  return {
    look,
    pieces: pieces.map((piece) =>
      toCanonicalPiece(piece, look.inspiration_asset_id),
    ),
  };
}

async function imageReference(assetId: string | null) {
  if (!assetId) return null;
  try {
    const image = await createWorkspaceSignedRead(assetId);
    return {
      assetId,
      url: image.signedUrl,
      expiresIn: image.expiresIn,
      status: "ready" as const,
    };
  } catch {
    return { assetId, url: null, expiresIn: 0, status: "unavailable" as const };
  }
}

export async function getLook(lookId: string) {
  const { look, pieces } = await getLookContext(lookId);
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data: activeDraft, error: draftError } = await client
    .from("workflow_drafts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("look_id", lookId)
    .eq("feature_kind", "inspiration")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (draftError)
    throw new ApiError(
      "draft_read_failed",
      "The inspiration draft could not be restored.",
      503,
      true,
    );
  const [reviews, matches, options, slots] = await Promise.all([
    client
      .from("look_reviews")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("look_id", lookId)
      .eq("is_current", true)
      .order("created_at", { ascending: false })
      .limit(1),
    client
      .from("wardrobe_matches")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("look_id", lookId)
      .eq("is_current", true)
      .eq("source_revision", look.revision),
    client
      .from("outfit_options")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("look_id", lookId)
      .eq("is_current", true)
      .eq("source_revision", look.revision)
      .order("created_at"),
    client
      .from("outfit_option_items")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("look_id", lookId)
      .order("position"),
  ]);
  if ([reviews.error, matches.error, options.error, slots.error].some(Boolean))
    throw new ApiError(
      "look_results_read_failed",
      "Some inspiration results could not be loaded. Try again.",
      502,
      true,
    );
  const operations = await client
    .from("workflow_operations")
    .select(
      "id,kind,status,input_revision,input_fingerprint,attempt_count,prompt_version,schema_version,model,result_ref,safe_error_code,created_at,completed_at,input,subject_id",
    )
    .eq("workspace_id", workspaceId)
    .in("subject_type", ["look", "outfit_option"])
    .in("subject_id", [
      lookId,
      ...(options.data ?? []).map((option) => option.id),
    ])
    .order("created_at", { ascending: false })
    .limit(50);
  if (operations.error)
    throw new ApiError(
      "look_operations_read_failed",
      "The inspiration operations could not be loaded.",
      502,
      true,
    );
  const wardrobeIds = [
    ...new Set([
      ...(matches.data ?? []).flatMap((match) =>
        match.wardrobe_item_id ? [match.wardrobe_item_id] : [],
      ),
      ...(matches.data ?? []).flatMap((match) =>
        z
          .array(z.object({ wardrobeItemId: z.uuid(), reason: z.string() }))
          .parse(match.rejected_candidates)
          .map((candidate) => candidate.wardrobeItemId),
      ),
      ...(slots.data ?? []).flatMap((slot) =>
        slot.wardrobe_item_id ? [slot.wardrobe_item_id] : [],
      ),
    ]),
  ];
  const wardrobe = wardrobeIds.length
    ? await client
        .from("wardrobe_items")
        .select("id,name,asset_id,source_type,inventory_status")
        .eq("workspace_id", workspaceId)
        .in("id", wardrobeIds)
        .eq("inventory_status", "owned")
        .is("archived_at", null)
    : { data: [], error: null };
  if (wardrobe.error)
    throw new ApiError(
      "wardrobe_read_failed",
      "The referenced wardrobe items could not be loaded.",
      502,
      true,
    );
  const itemReferences = new Map(
    await Promise.all(
      wardrobe.data.map(
        async (item) =>
          [
            item.id,
            {
              id: item.id,
              name: item.name,
              sourceType: item.source_type,
              image: await imageReference(item.asset_id),
            },
          ] as const,
      ),
    ),
  );
  const review = reviews.data?.[0];
  const confidenceResult = review
    ? confidenceSchema.parse(review.explanation)
    : null;
  const personalization = await getPersonalizationSnapshot();
  const inputMetadataSchema = z.object({
    preferenceFingerprint: z.string().nullable().optional(),
    inventoryFingerprint: z.string().nullable().optional(),
    inventoryMode: z.enum(["sample", "live"]).optional(),
  });
  const inventoryModes = new Set<"sample" | "live">();
  for (const metadata of [
    ...(matches.data ?? []).map((match) => match.input_metadata),
    ...(options.data ?? []).map((option) => option.provider_metadata),
  ]) {
    const parsedMetadata = inputMetadataSchema.safeParse(metadata);
    if (parsedMetadata.success && parsedMetadata.data.inventoryMode)
      inventoryModes.add(parsedMetadata.data.inventoryMode);
  }
  const currentInventory = new Map(
    await Promise.all(
      [...inventoryModes].map(
        async (mode) =>
          [mode, (await listInventory(mode)).fingerprint] as const,
      ),
    ),
  );
  function inputsStale(metadata: unknown, includesInventory: boolean) {
    const parsedMetadata = inputMetadataSchema.safeParse(metadata);
    if (
      !parsedMetadata.success ||
      parsedMetadata.data.preferenceFingerprint !== personalization.fingerprint
    )
      return true;
    if (!includesInventory) return false;
    const mode = parsedMetadata.data.inventoryMode;
    return (
      !mode ||
      parsedMetadata.data.inventoryFingerprint !== currentInventory.get(mode)
    );
  }
  function inventoryMode(metadata: unknown) {
    const parsed = inputMetadataSchema.safeParse(metadata);
    return parsed.success ? (parsed.data.inventoryMode ?? null) : null;
  }
  const latestInventoryOperation = operations.data?.find((operation) =>
    ["wardrobe_match", "outfit_options", "option_regeneration"].includes(
      operation.kind,
    ),
  );
  return {
    id: look.id,
    activeDraftId: activeDraft?.id ?? null,
    inventoryMode: inventoryMode(
      matches.data?.[0]?.input_metadata ??
        options.data?.[0]?.provider_metadata ??
        latestInventoryOperation?.input,
    ),
    title: look.title,
    occasion: look.occasion,
    revision: look.revision,
    status: look.status,
    sourceType: look.source_type,
    inspirationImage: await imageReference(look.inspiration_asset_id),
    pieces,
    confidenceReview: review
      ? {
          ...confidenceResult,
          id: review.id,
          inputsUsed: review.inputs_used,
          uncertainty: review.uncertainty,
          sourceRevision: review.source_revision,
          preferenceRevision: review.preference_revision,
          sourceType: review.source_type,
          stale:
            review.source_revision !== look.revision ||
            inputsStale(review.input_metadata, false),
        }
      : null,
    matches: (matches.data ?? []).map((match) => ({
      id: match.id,
      pieceId: match.piece_id,
      outcome: match.match_type,
      inventoryMode: inventoryMode(match.input_metadata),
      wardrobeItem: match.wardrobe_item_id
        ? (itemReferences.get(match.wardrobe_item_id) ?? null)
        : null,
      rationale: match.rationale,
      explanation: explanationSchema.parse(match.explanation),
      sharedAttributes: match.shared_attributes,
      differences: match.differences,
      rejectedCandidates: z
        .array(z.object({ wardrobeItemId: z.uuid(), reason: z.string() }))
        .parse(match.rejected_candidates)
        .map((candidate) => ({
          ...candidate,
          wardrobeItem: itemReferences.get(candidate.wardrobeItemId) ?? null,
        })),
      evidenceCoverage: match.evidence_coverage,
      confidence: match.confidence,
      sourceRevision: match.source_revision,
      sourceType: match.source_type,
      stale:
        match.source_revision !== look.revision ||
        inputsStale(match.input_metadata, true),
    })),
    outfitOptions: (options.data ?? []).map((option) => ({
      id: option.id,
      optionType: option.option_type,
      inventoryMode: inventoryMode(option.provider_metadata),
      title: option.title,
      concept: option.concept,
      rationale: option.rationale,
      explanation: option.explanation,
      inputsUsed: option.inputs_used,
      uncertainty: option.uncertainty,
      status: option.status,
      revision: option.revision,
      sourceRevision: option.source_revision,
      sourceType: option.source_type,
      stale:
        option.source_revision !== look.revision ||
        inputsStale(option.provider_metadata, true),
      items: (slots.data ?? [])
        .filter((slot) => slot.option_id === option.id)
        .map((slot) => ({
          id: slot.id,
          slotId: slot.slot_id,
          category: slot.category,
          itemKind: slot.item_kind,
          pieceId: slot.piece_id,
          wardrobeItem: slot.wardrobe_item_id
            ? (itemReferences.get(slot.wardrobe_item_id) ?? null)
            : null,
          productId: slot.product_id,
          missingBrief: slot.missing_brief,
          requestedBrief: slot.requested_brief,
          rationale: slot.rationale,
          position: slot.position,
          revision: slot.revision,
        })),
    })),
    operations: (operations.data ?? []).map((operation) => ({
      id: operation.id,
      kind: operation.kind,
      status: operation.status,
      inputRevision: operation.input_revision,
      inputFingerprint: operation.input_fingerprint,
      attemptCount: operation.attempt_count,
      promptVersion: operation.prompt_version,
      schemaVersion: operation.schema_version,
      model: operation.model,
      resultRef: operation.result_ref,
      errorCode: operation.safe_error_code,
      createdAt: operation.created_at,
      completedAt: operation.completed_at,
      subjectId: operation.subject_id,
      inventoryMode:
        operation.input &&
        typeof operation.input === "object" &&
        !Array.isArray(operation.input)
          ? z
              .enum(["sample", "live"])
              .nullable()
              .catch(null)
              .parse(operation.input.inventoryMode ?? null)
          : null,
      optionType:
        operation.input &&
        typeof operation.input === "object" &&
        !Array.isArray(operation.input)
          ? z
              .enum(["closest", "from_wardrobe", "fresh_alternative"])
              .nullable()
              .catch(null)
              .parse(operation.input.optionType ?? null)
          : null,
    })),
    marketplaceIntegration: "pending" as const,
  };
}

function canonicalValues(
  garment: Pick<
    Garment,
    "name" | "category" | "subcategory" | "description" | "attributes"
  >,
): Record<string, z.infer<ReturnType<typeof z.json>>> {
  return {
    name: garment.name,
    category: garment.category,
    subcategory: garment.subcategory,
    description: garment.description,
    ...Object.fromEntries(
      Object.entries(compactAttributes(garment.attributes)).map(
        ([key, value]) => [`attributes.${key}`, value ?? null],
      ),
    ),
  };
}

export async function savePieces(lookId: string, input: unknown) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const parsed = savePiecesSchema.parse(input);
  const current = await getLookContext(lookId);
  if (current.look.source_type === "sample")
    throw new ApiError(
      "sample_read_only",
      "Prepared sample looks cannot be edited.",
      409,
    );
  if (current.look.revision !== parsed.expectedRevision)
    throw new ApiError(
      "revision_conflict",
      "This inspiration changed. Reload it before saving again.",
      409,
    );
  const currentPieces = new Map(
    current.pieces.map((piece) => [piece.id, piece]),
  );
  const changedAt = new Date().toISOString();
  const prepared = parsed.pieces.map((piece, position) => {
    const previous = piece.id ? currentPieces.get(piece.id) : undefined;
    if (piece.id && !previous) notFound();
    const corrections = previous ? { ...previous.corrections } : {};
    const previousValues = previous ? canonicalValues(previous) : {};
    const nextValues = canonicalValues(piece);
    for (const path of piece.clearCorrections ?? []) {
      const correction = corrections[path];
      if (
        !correction ||
        typeof correction !== "object" ||
        Array.isArray(correction) ||
        !("originalValue" in correction)
      )
        throw new ApiError(
          "invalid_correction",
          "Choose an existing correction to clear.",
        );
      nextValues[path] = correction.originalValue ?? null;
      delete corrections[path];
    }
    for (const path of new Set([
      ...Object.keys(previousValues),
      ...Object.keys(nextValues),
    ])) {
      if (piece.clearCorrections?.includes(path)) continue;
      const before = previousValues[path] ?? null;
      const after = nextValues[path] ?? null;
      if (!previous || JSON.stringify(before) !== JSON.stringify(after)) {
        const old = corrections[path];
        const original =
          old &&
          typeof old === "object" &&
          !Array.isArray(old) &&
          "originalValue" in old
            ? old.originalValue
            : before;
        corrections[path] = {
          originalValue: original ?? null,
          previousValue: before,
          value: after,
          source: "user",
          timestamp: changedAt,
          revision: (previous?.revision ?? 0) + 1,
        };
      }
    }
    const attributes = attributesSchema.parse(
      Object.fromEntries(
        Object.entries(nextValues)
          .filter(([path]) => path.startsWith("attributes."))
          .map(([path, value]) => [path.slice(11), value]),
      ),
    );
    const effective = garmentSchema.parse({
      name: nextValues.name,
      category: nextValues.category,
      subcategory: nextValues.subcategory,
      description: nextValues.description,
      attributes,
      observations: [],
      confidence: piece.confidence,
      uncertainty: piece.uncertainty,
    });
    const provenance =
      previous?.provenance ??
      Object.fromEntries(
        Object.keys(nextValues).map((path) => [
          path,
          {
            source: "user",
            state: "reported",
            confidence: null,
            evidence: "Manually entered in Review pieces.",
            uncertainty: null,
          },
        ]),
      );
    if (Buffer.byteLength(JSON.stringify(corrections), "utf8") > 32768)
      throw new ApiError(
        "correction_limit",
        "This garment has too many corrections to save.",
      );
    return {
      id: piece.id ?? randomUUID(),
      name: effective.name,
      category: categorySchema.parse(effective.category),
      subcategory: effective.subcategory,
      description: effective.description,
      attributes: compactAttributes(effective.attributes),
      provenance,
      corrections,
      confidence: previous?.confidence ?? null,
      uncertainty: previous?.uncertainty ?? effective.uncertainty,
      source_type: previous?.sourceType ?? "manual",
      position,
      image_context: {},
    };
  });
  const { data, error } = await context.client.rpc("save_inspiration_pieces", {
    p_workspace_id: context.workspaceId,
    p_look_id: lookId,
    p_expected_revision: parsed.expectedRevision,
    p_pieces: prepared,
  });
  if (error) rpcError(error);
  const look = z
    .object({ id: uuid, revision: z.number().int().positive() })
    .parse(data);
  return {
    lookId: look.id,
    revision: look.revision,
    pieces: (await getLookContext(lookId)).pieces,
  };
}
