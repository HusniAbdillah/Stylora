import "server-only";
import { createHash, randomUUID } from "node:crypto";
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
  TEXT_MODEL,
  generateFashionJson,
} from "@/features/ai/openai";
import {
  startOperation,
  runOperation,
  operationStatus,
  assertWorkflowRpc,
} from "@/features/operations/server";
import { getCapsuleDraft } from "./drafts";
import { getCapsule } from "./queries";
import { capsuleBriefReady, capsuleBriefSchema, categorySchema } from "./schema";
import { CAPSULE_TEMPLATES } from "./capsule-types";
import {
  capsuleGenerationSchema,
  validateCapsuleGeneration,
} from "./generation-schema";

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
  const sameBrief = draft && (!parsed.brief || JSON.stringify(parsed.brief) === JSON.stringify(draft.brief));
  const acknowledgedLink = draft && parsed.brief && draft.capsuleId && draft.revision === parsed.expectedRevision + 1;
  if (!draft || !sameBrief || (draft.revision !== parsed.expectedRevision && !acknowledgedLink))
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
  if (existing && (draft.capsuleId ? existing.revision !== draft.capsuleRevision : !unchanged || existing.revision !== 1))
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
  if (draft.capsuleId === capsuleId && draft.capsuleRevision === capsuleRevision) {
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

async function capsuleContext(id: string) {
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
    `Activities: ${capsule.brief.activities.join(", ")}`,
    `Dress code: ${capsule.brief.dressCode}`,
    `Palette: ${capsule.brief.palette}`,
    ...Object.keys(personalization.preferences).map(
      (key) => `Preference: ${key}`,
    ),
  ];
  const input = {
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
  if (Buffer.byteLength(JSON.stringify(input)) > 100 * 1024)
    throw new ApiError(
      "capsule_context_too_large",
      "Choose fewer pieces so their complete descriptions fit the analysis request.",
      422,
    );
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        input,
        prompt: FASHION_PROMPT_VERSION,
        schema: FASHION_SCHEMA_VERSION,
        knowledge: FASHION_KNOWLEDGE_VERSION,
        model: TEXT_MODEL,
      }),
    )
    .digest("hex");
  return { capsule, input, fingerprint };
}

export async function generateCapsule(id: string) {
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
    promptVersion: FASHION_PROMPT_VERSION,
    schemaVersion: FASHION_SCHEMA_VERSION,
    model: TEXT_MODEL,
  });
  const complete = await runOperation(operation.id, {
    execute: async (claim) => {
      const fresh = await capsuleContext(id);
      if (fresh.fingerprint !== claim.inputFingerprint)
        throw new ApiError(
          "capsule_superseded",
          "The capsule inputs changed. Generate the current revision.",
          409,
        );
      const response = await generateFashionJson({
        task: "capsule",
        context: fresh.input,
        schema: z.toJSONSchema(capsuleGenerationSchema),
        signal: claim.signal,
        validate: (value) =>
          validateCapsuleGeneration(
            value,
            fresh.capsule.brief,
            fresh.input.items,
            fresh.input.allowedSignals,
          ),
      });
      return response.value;
    },
    commit: async (claim, output) => {
      const fresh = await capsuleContext(id);
      if (fresh.fingerprint !== claim.inputFingerprint)
        throw new ApiError(
          "capsule_superseded",
          "The capsule inputs changed. Generate the current revision.",
          409,
        );
      const outfitIds = output.outfits.map(() => randomUUID());
      const additions = new Map(
        output.additions.map((addition) => [addition.key, addition]),
      );
      const outfits = output.outfits.map((outfit, index) => ({
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
      const missing = output.additions.map(
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
        throw new ApiError(
          "capsule_commit_conflict",
          "Your capsule changed before generation finished. Your newer choices are kept.",
          409,
        );
    },
  });
  return operationStatus(complete);
}
