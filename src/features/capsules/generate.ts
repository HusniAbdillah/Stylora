import "server-only";
import { randomUUID } from "node:crypto";
import { getFashionTaskSettings } from "@/lib/ai/task-settings";
import {
  reserveWorkflowProviderCall,
  releaseWorkflowProviderCall,
} from "@/features/operations/provider-budget";
import { z } from "zod";
import { attributesSchema } from "@/lib/ai/fashion-schema";
import { resolveEffectiveAttributes } from "@/features/matching/gates";
import { ApiError } from "@/lib/api";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
} from "@/lib/supabase/server";
import { getPersonalizationSnapshot } from "@/features/preferences/server";
import {
  FASHION_KNOWLEDGE_VERSION,
  FASHION_PROMPT_VERSION,
  FASHION_SCHEMA_VERSION,
  CAPSULE_PROMPT_VERSION,
  CAPSULE_SOURCE_VERSIONS,
  TEXT_MODEL,
  generateFashionJson,
  capsuleProviderMetadataSchema,
  type CapsuleProviderMetadata,
} from "@/features/ai/openai";
import {
  startOperation,
  runOperation,
  operationStatus,
  assertWorkflowRpc,
  readOperation,
  OperationError,
  type OperationClaim,
  failOperation,
} from "@/features/operations/server";
import { getCapsuleDraft } from "./drafts";
import { getCapsule } from "./queries";
import {
  capsuleBriefReady,
  capsuleBriefSchema,
  categorySchema,
} from "./schema";
import { CAPSULE_TEMPLATES } from "./capsule-types";
import {
  capsuleGenerationSchema,
  validateCapsuleGeneration,
  capsuleProviderSchema,
  CapsuleOutputError,
  capsuleDiagnostics,
  type CapsuleGeneration,
} from "./generation-schema";
import {
  capsuleFingerprint,
  capsuleGenerationConfig,
  capsuleProviderContext,
  compactCapsuleItem,
  readCapturedCapsule,
  stableCapsuleValue,
  type CapturedCapsule,
} from "./generation-context";

export async function prepareCapsule(input: unknown) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  await assertWorkflowRpc("save_capsule_draft");
  const parsed = z
    .strictObject({
      draftId: z.uuid(),
      expectedRevision: z.number().int().positive(),
      brief: capsuleBriefSchema.optional(),
    })
    .parse(input);
  const draft = await getCapsuleDraft(parsed.draftId);
  const sameBrief =
    draft &&
    (!parsed.brief ||
      JSON.stringify(parsed.brief) === JSON.stringify(draft.brief));
  const acknowledgedLink =
    draft &&
    parsed.brief &&
    draft.capsuleId &&
    draft.revision === parsed.expectedRevision + 1;
  if (
    !draft ||
    !sameBrief ||
    (draft.revision !== parsed.expectedRevision && !acknowledgedLink)
  )
    throw new ApiError(
      "draft_conflict",
      "Your draft changed. Reopen it before building a capsule.",
      409,
    );
  const brief = draft.brief;
  const capsuleId = draft.capsuleId ?? draft.id;
  if (!capsuleBriefReady(brief))
    throw new ApiError(
      "capsule_not_ready",
      "Complete the capsule brief and select owned pieces first.",
      422,
    );
  const { data: existing, error: readError } = await context.client
    .from("capsules")
    .select("id,revision,brief")
    .eq("workspace_id", context.workspaceId)
    .eq("id", capsuleId)
    .maybeSingle();
  if (readError)
    throw new ApiError(
      "capsule_read_failed",
      "Your capsule could not be loaded. Try again.",
      503,
      true,
    );
  const unchanged = Boolean(
    existing &&
    JSON.stringify(capsuleBriefSchema.parse(existing.brief)) ===
      JSON.stringify(brief),
  );
  if (
    existing &&
    (draft.capsuleId
      ? existing.revision !== draft.capsuleRevision
      : !unchanged || existing.revision !== 1)
  )
    throw new ApiError(
      "capsule_revision_conflict",
      "This capsule changed in another session. Your draft is kept.",
      409,
    );
  let capsuleRevision = existing?.revision ?? 0;
  if (!unchanged) {
    const { data, error } = await context.client.rpc("save_capsule_draft", {
      p_workspace_id: context.workspaceId,
      p_capsule_id: capsuleId,
      p_expected_revision: draft.capsuleRevision ?? 0,
      p_title:
        CAPSULE_TEMPLATES.find((template) => template.id === brief.templateId)
          ?.name ?? "Custom capsule",
      p_brief: brief,
      p_item_ids: brief.includedItemIds,
    });
    if (error || !data)
      throw new ApiError(
        "capsule_save_failed",
        "Your capsule could not be prepared. Your draft is kept.",
        409,
        true,
      );
    capsuleRevision = z
      .object({ id: z.uuid(), revision: z.number().int().positive() })
      .parse(data).revision;
  }
  if (
    draft.capsuleId === capsuleId &&
    draft.capsuleRevision === capsuleRevision
  ) {
    return { capsuleId, capsuleRevision, draftRevision: draft.revision };
  }
  const { data: linked, error: linkError } = await context.client
    .from("workflow_drafts")
    .update({
      capsule_id: capsuleId,
      payload: { brief, capsuleRevision },
      revision: draft.revision + 1,
    })
    .eq("workspace_id", context.workspaceId)
    .eq("id", draft.id)
    .eq("feature_kind", "capsules")
    .eq("revision", draft.revision)
    .select("id,revision")
    .maybeSingle();
  if (linkError || !linked)
    throw new ApiError(
      "capsule_draft_link_failed",
      "Your capsule is saved. Retry to reconnect its draft.",
      503,
      true,
    );
  return { capsuleId, capsuleRevision, draftRevision: linked.revision };
}

async function capsuleContext(
  id: string,
  options: { legacy?: boolean; model?: string } = {},
) {
  const capsule = await getCapsule(id);
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data, error } = await client
    .from("active_owned_wardrobe")
    .select(
      "id,name,category,subcategory,description,attributes,inferred_attributes,corrections,provenance,revision",
    )
    .eq("workspace_id", workspaceId)
    .in("id", capsule.brief.includedItemIds)
    .order("id");
  if (error)
    throw new ApiError(
      "capsule_items_unavailable",
      "Your wardrobe could not be loaded. Retry generation.",
      503,
      true,
    );
  const items = z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().max(160),
        category: categorySchema,
        subcategory: z.string().max(120).nullable(),
        description: z.string().max(600),
        revision: z.number().int().positive(),
        attributes: z.record(z.string(), z.json()),
        inferred_attributes: z.record(z.string(), z.json()),
        corrections: z.record(z.string(), z.json()),
        provenance: z.record(z.string(), z.json()),
      }),
    )
    .parse(data)
    .map(({ inferred_attributes, ...item }) => ({
      ...item,
      attributes: attributesSchema.parse(
        resolveEffectiveAttributes({
          attributes: item.attributes,
          inferredAttributes: inferred_attributes,
          corrections: item.corrections,
          provenance: item.provenance,
        }),
      ),
    }));
  if (items.length !== capsule.brief.includedItemIds.length)
    throw new ApiError(
      "capsule_items_changed",
      "Some selected pieces are unavailable. Edit your capsule items.",
      409,
    );
  let personalization;
  try {
    personalization = await getPersonalizationSnapshot();
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "preferences_not_found")
      throw error;
    personalization = { preferences: {}, revision: 0 };
  }
  const signals = [
    "Owned wardrobe",
    `Weather: ${capsule.brief.weather}`,
    ...(options.legacy
      ? [`Activities: ${capsule.brief.activities.join(", ")}`]
      : capsule.brief.activities.map((activity) => `Activity: ${activity}`)),
    `Dress code: ${capsule.brief.dressCode}`,
    `Palette: ${capsule.brief.palette}`,
    ...Object.keys(personalization.preferences).map(
      (key) => `Preference: ${key}`,
    ),
  ];
  const legacyInput = {
    brief: capsule.brief,
    capsuleRevision: capsule.revision,
    items,
    knowledgeVersion: FASHION_KNOWLEDGE_VERSION,
    itemRevisions: Object.fromEntries(
      items.map((item) => [item.id, item.revision]),
    ),
    preferences: personalization.preferences,
    preferenceRevision: personalization.revision,
    allowedSignals: signals,
    instructions:
      "Return the requested number of complete, meaningfully distinct outfits. Use exact allowedSignals in inputsUsed. Only use supplied owned IDs. Respect required and excluded IDs. Additions must unlock at least two demonstrated outfits. Keep all uncertainty explicit.",
  };
  const model = options.model ?? TEXT_MODEL;
  const input: CapturedCapsule = options.legacy
    ? legacyInput
    : readCapturedCapsule({
        ...legacyInput,
        items: items.map(compactCapsuleItem),
        contractVersion: "capsule-context.v2",
        generationConfig: capsuleGenerationConfig(
          model,
          capsule.brief.targetOutfits,
          getFashionTaskSettings("capsule_generation"),
        ),
        sourceVersions: CAPSULE_SOURCE_VERSIONS,
      });
  if (
    Buffer.byteLength(JSON.stringify(capsuleProviderContext(input))) >
      100 * 1024 ||
    Buffer.byteLength(JSON.stringify(input)) > 240 * 1024
  )
    throw new ApiError(
      "capsule_context_too_large",
      "Choose fewer pieces so their complete descriptions fit the analysis request.",
      422,
    );
  const fingerprint = capsuleFingerprint(
    input,
    {
      prompt: options.legacy ? FASHION_PROMPT_VERSION : CAPSULE_PROMPT_VERSION,
      schema: FASHION_SCHEMA_VERSION,
      knowledge: FASHION_KNOWLEDGE_VERSION,
      model,
    },
    options.legacy,
  );
  return { capsule, input, fingerprint };
}

export async function generateCapsule(
  id: string,
  options: { execute?: boolean } = {},
) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  await assertWorkflowRpc("commit_capsule_generation");
  const current = await capsuleContext(z.uuid().parse(id));
  const operation = await startOperation({
    kind: "capsule_generation",
    subjectType: "capsule",
    subjectId: id,
    inputRevision: current.capsule.revision,
    inputFingerprint: current.fingerprint,
    input: current.input,
    promptVersion: CAPSULE_PROMPT_VERSION,
    schemaVersion: FASHION_SCHEMA_VERSION,
    model: TEXT_MODEL,
  });
  return operationStatus(
    options.execute === false
      ? operation
      : await runCapsuleOperation(operation.id),
  );
}

const metadataSchema = z.strictObject({
  model: z.string().min(1).max(120),
  prompt_version: z.string().min(1).max(120),
  schema_version: z.string().min(1).max(120),
});
type ExecutionMetadata = z.infer<typeof metadataSchema>;

export async function runCapsuleOperation(operationId: string) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const operation = await readOperation(z.uuid().parse(operationId));
  if (
    operation.kind !== "capsule_generation" ||
    operation.subject_type !== "capsule"
  )
    throw new OperationError(
      "CAPSULE_OPERATION_INVALID",
      "This capsule operation is unavailable.",
      404,
    );
  if (
    ["succeeded", "failed", "cancelled", "superseded"].includes(
      operation.status,
    )
  )
    return operation;
  await assertWorkflowRpc("commit_capsule_generation");
  const id = operation.subject_id;
  let latestProviderMetadata: CapsuleProviderMetadata | undefined;
  async function persistProviderMetadata(claim: OperationClaim) {
    if (!latestProviderMetadata) return;
    const current = await context.client
      .from("workflow_operations")
      .select("result_ref,status,provider_call_count")
      .eq("workspace_id", context.workspaceId)
      .eq("id", claim.operationId)
      .eq("attempt_count", claim.attemptCount)
      .eq("input_fingerprint", claim.inputFingerprint)
      .in("status", ["succeeded", "failed", "cancelled", "superseded"])
      .abortSignal(AbortSignal.timeout(10000))
      .maybeSingle();
    if (current.error)
      throw new OperationError(
        "CAPSULE_METADATA_UNAVAILABLE",
        "Capsule provider metadata could not be recorded.",
      );
    if (!current.data) return;
    const reference = z
      .record(z.string(), z.json())
      .parse(current.data.result_ref ?? {});
    const provider = z.json().parse({
      ...latestProviderMetadata,
      workflowAttempt: claim.attemptCount,
      operationCallCount: current.data.provider_call_count,
      usageScope: "workflow_attempt",
    });
    const requestId = [...latestProviderMetadata.requests]
      .reverse()
      .find((request) => request.requestId)?.requestId;
    const query = context.client
      .from("workflow_operations")
      .update({
        result_ref: { ...reference, provider },
        ...(requestId ? { provider_request_id: requestId } : {}),
      })
      .eq("workspace_id", context.workspaceId)
      .eq("id", claim.operationId)
      .eq("attempt_count", claim.attemptCount)
      .eq("input_fingerprint", claim.inputFingerprint)
      .eq("status", current.data.status);
    const update = await (
      current.data.result_ref === null
        ? query.is("result_ref", null)
        : query.eq("result_ref", JSON.stringify(current.data.result_ref))
    )
      .abortSignal(AbortSignal.timeout(10000))
      .select("id")
      .maybeSingle();
    if (update.error)
      throw new OperationError(
        "CAPSULE_METADATA_UNAVAILABLE",
        "Capsule provider metadata could not be recorded.",
      );
  }
  async function recordProviderMetadata(claim: OperationClaim) {
    try {
      await persistProviderMetadata(claim);
    } catch {
      console.warn("CAPSULE_METADATA_UNAVAILABLE", {
        operationId: claim.operationId,
        attemptCount: claim.attemptCount,
      });
    }
  }
  async function metadata(claim: OperationClaim) {
    const result = await context.client
      .from("workflow_operations")
      .select("model,prompt_version,schema_version")
      .eq("workspace_id", context.workspaceId)
      .eq("id", claim.operationId)
      .eq("kind", "capsule_generation")
      .eq("subject_type", "capsule")
      .eq("subject_id", id)
      .eq("attempt_count", claim.attemptCount)
      .eq("input_fingerprint", claim.inputFingerprint)
      .eq("status", "running")
      .is("cancel_requested_at", null)
      .abortSignal(claim.signal)
      .maybeSingle();
    if (result.error)
      throw new OperationError(
        "PROVIDER_NETWORK_ERROR",
        "Capsule operation metadata could not be verified.",
        503,
        true,
      );
    if (!result.data)
      throw new OperationError(
        "CAPSULE_OPERATION_CHANGED",
        "This capsule request changed or was cancelled.",
        409,
      );
    const parsed = metadataSchema.safeParse(result.data);
    if (!parsed.success)
      throw new CapsuleOutputError(
        "CAPSULE_CONTEXT_INVALID",
        capsuleDiagnostics(parsed.error.issues),
      );
    return parsed.data;
  }
  async function assertCurrent(
    claim: OperationClaim,
    captured: CapturedCapsule,
    capturedMetadata: ExecutionMetadata,
  ) {
    const currentMetadata = await metadata(claim);
    if (
      stableCapsuleValue(currentMetadata) !==
        stableCapsuleValue(capturedMetadata) ||
      capturedMetadata.prompt_version !==
        (captured.contractVersion
          ? CAPSULE_PROMPT_VERSION
          : FASHION_PROMPT_VERSION) ||
      capturedMetadata.schema_version !== FASHION_SCHEMA_VERSION
    )
      throw new OperationError(
        "CAPSULE_POLICY_CHANGED",
        "The Capsule generation policy changed. Generate the current inputs.",
        409,
      );
    let fresh: Awaited<ReturnType<typeof capsuleContext>>;
    try {
      fresh = await capsuleContext(id, {
        legacy: !captured.contractVersion,
        model: capturedMetadata.model,
      });
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new CapsuleOutputError(
          "CAPSULE_CONTEXT_INVALID",
          capsuleDiagnostics(error.issues),
        );
      if (error instanceof ApiError)
        throw new OperationError(
          error.status === 404 || error.status === 409
            ? "CAPSULE_SUPERSEDED"
            : "CAPSULE_CONTEXT_INVALID",
          "Current Capsule inputs could not be verified.",
          error.status,
        );
      throw error;
    }
    if (
      claim.inputRevision !== captured.capsuleRevision ||
      (captured.generationConfig?.model &&
        captured.generationConfig.model !== capturedMetadata.model) ||
      (captured.generationConfig &&
        stableCapsuleValue(captured.generationConfig) !==
          stableCapsuleValue(
            capsuleGenerationConfig(
              capturedMetadata.model,
              captured.brief.targetOutfits,
              getFashionTaskSettings("capsule_generation"),
            ),
          )) ||
      fresh.fingerprint !== claim.inputFingerprint ||
      stableCapsuleValue(readCapturedCapsule(fresh.input)) !==
        stableCapsuleValue(captured)
    )
      throw new OperationError(
        "CAPSULE_SUPERSEDED",
        "The capsule inputs changed. Generate the current revision.",
        409,
      );
  }
  return runOperation<{
    value: CapsuleGeneration;
    captured: CapturedCapsule;
    capturedMetadata: ExecutionMetadata;
  }>(operation.id, {
    checkpoint: {
      serialize: (output) => ({
        result: z.json().parse(output.value),
        metadata: z.json().parse({
          capturedMetadata: output.capturedMetadata,
          providerMetadata: latestProviderMetadata,
        }),
      }),
      restore: async (claim, result, savedMetadata) => {
        const captured = readCapturedCapsule(claim.input);
        const capturedMetadata = await metadata(claim);
        await assertCurrent(claim, captured, capturedMetadata);
        const value = validateCapsuleGeneration(
          result,
          captured.brief,
          captured.items,
          captured.allowedSignals,
        );
        const stored = z
          .object({
            capturedMetadata: metadataSchema,
            providerMetadata: z.unknown(),
          })
          .parse(savedMetadata);
        if (
          stableCapsuleValue(stored.capturedMetadata) !==
          stableCapsuleValue(capturedMetadata)
        )
          throw new OperationError(
            "CAPSULE_SUPERSEDED",
            "The captured Capsule settings changed.",
            409,
          );
        // Metadata was captured by this executor; result and dependencies are
        // validated again before the transaction commits it.
        latestProviderMetadata = capsuleProviderMetadataSchema.parse(
          stored.providerMetadata,
        );
        return { value, captured, capturedMetadata };
      },
    },
    execute: async (claim) => {
      const captured = readCapturedCapsule(claim.input);
      const capturedMetadata = await metadata(claim);
      await assertCurrent(claim, captured, capturedMetadata);
      const response = await generateFashionJson({
        task: "capsule",
        context: capsuleProviderContext(captured),
        config:
          captured.generationConfig ??
          capsuleGenerationConfig(
            capturedMetadata.model,
            captured.brief.targetOutfits,
            getFashionTaskSettings("capsule_generation"),
          ),
        legacy: !captured.contractVersion,
        schema: z.toJSONSchema(
          captured.contractVersion
            ? capsuleProviderSchema(
                captured.brief,
                captured.items,
                captured.allowedSignals,
              )
            : capsuleGenerationSchema,
        ),
        signal: claim.signal,
        beforeRequest: () => reserveWorkflowProviderCall(claim),
        afterRequest: () => releaseWorkflowProviderCall(claim),
        onProviderMetadata: async (metadata) => {
          latestProviderMetadata = metadata;
        },
        beforeCorrection: () =>
          assertCurrent(claim, captured, capturedMetadata),
        validate: (value) =>
          validateCapsuleGeneration(
            value,
            captured.brief,
            captured.items,
            captured.allowedSignals,
          ),
      });
      return { ...response, captured, capturedMetadata };
    },
    commit: async (claim, output) => {
      await assertCurrent(claim, output.captured, output.capturedMetadata);
      const outfitIds = output.value.outfits.map(() => randomUUID());
      const additions = new Map(
        output.value.additions.map((addition) => [addition.key, addition]),
      );
      const outfits = output.value.outfits.map((outfit, index) => ({
        id: outfitIds[index],
        title: outfit.title,
        rationale: outfit.summary,
        explanation: {
          whyThis: outfit.whyThis,
          differences: outfit.differences,
        },
        inputs_used: { signals: outfit.inputsUsed },
        uncertainty: outfit.uncertainty,
        proposed_slots: outfit.additionKeys.map((key) => ({
          additionKey: key,
          brief: additions.get(key)!.brief,
        })),
        wardrobe_item_ids: outfit.itemIds,
      }));
      const missing = output.value.additions.map(
        ({ unlockedOutfitIndices, ...addition }) => ({
          ...addition,
          unlockedOutfitIds: unlockedOutfitIndices.map(
            (index) => outfitIds[index],
          ),
        }),
      );
      const { error } = await context.client.rpc("commit_capsule_generation", {
        p_workspace_id: context.workspaceId,
        p_operation_id: claim.operationId,
        p_attempt_count: claim.attemptCount,
        p_input_fingerprint: claim.inputFingerprint,
        p_capsule_id: id,
        p_expected_revision: claim.inputRevision,
        p_outfits: outfits,
        p_missing_additions: missing,
      });
      if (error)
        throw new OperationError(
          ["40001", "23514", "P0002"].includes(error.code)
            ? "CAPSULE_COMMIT_CONFLICT"
            : "CAPSULE_COMMIT_UNAVAILABLE",
          "The Capsule result could not be attached. Your draft and validated result are kept.",
          ["40001", "23514", "P0002"].includes(error.code) ? 409 : 503,
          !["40001", "23514", "P0002"].includes(error.code),
        );
      await recordProviderMetadata(claim);
    },
    fail: async (claim, failure) => {
      await failOperation(claim, failure);
      await recordProviderMetadata(claim);
    },
  });
}
