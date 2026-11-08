import "server-only";
import { z } from "zod";
import { getFashionTaskSettings } from "@/lib/ai/task-settings";
import { capsuleGenerationConfig } from "./generation-context";
import { ApiError } from "@/lib/api";
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import { getCapsuleInventory } from "./drafts";
import { capsuleBriefSchema } from "./schema";
import { missingBriefSchema } from "./generation-schema";
import type { CapsuleAddition, CapsuleResult } from "./capsule-types";
import {
  capsuleResultContextKey,
  capsuleResultNeedsGeneration,
} from "./result-state";
import {
  CAPSULE_PROMPT_VERSION,
  FASHION_SCHEMA_VERSION,
  FASHION_KNOWLEDGE_VERSION,
  TEXT_MODEL,
} from "@/features/ai/openai";

const explanationSchema = z.object({
  whyThis: z.array(
    z.object({ reason: z.string(), evidenceItemIds: z.array(z.uuid()) }),
  ),
  differences: z.array(z.string()),
});
const proposedSchema = z.array(
  z.object({ additionKey: z.string(), brief: missingBriefSchema }),
);

export async function getCapsule(id: string) {
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data, error } = await client
    .from("capsules")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", z.uuid().parse(id))
    .maybeSingle();
  if (error)
    throw new ApiError(
      "capsule_read_failed",
      "This capsule could not be loaded. Retry loading.",
      503,
      true,
    );
  if (!data)
    throw new ApiError(
      "capsule_not_found",
      "This capsule is unavailable.",
      404,
    );
  return { ...data, brief: capsuleBriefSchema.parse(data.brief) };
}

export async function getCapsuleResult(id: string) {
  const capsule = await getCapsule(id);
  const { client, workspaceId } = getWorkspaceDatabase();
  const [outfitsResponse, linksResponse, inventory, completed, preferences] =
    await Promise.all([
      client
        .from("capsule_outfits")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("capsule_id", id)
        .eq("source_revision", capsule.revision)
        .order("created_at"),
      client
        .from("capsule_outfit_items")
        .select("outfit_id,wardrobe_item_id,position")
        .eq("workspace_id", workspaceId)
        .eq("capsule_id", id)
        .order("position"),
      getCapsuleInventory(),
      client
        .from("workflow_operations")
        .select(
          "id,input,input_revision,result_ref,model,prompt_version,schema_version",
        )
        .eq("workspace_id", workspaceId)
        .eq("subject_type", "capsule")
        .eq("subject_id", id)
        .eq("kind", "capsule_generation")
        .eq("status", "succeeded")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from("user_preferences")
        .select("revision")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
    ]);
  if (outfitsResponse.error || linksResponse.error)
    throw new ApiError(
      "capsule_results_read_failed",
      "The capsule outfits could not be loaded. Retry loading.",
      503,
      true,
    );
  const owned = new Map(inventory.map((item) => [item.id, item]));
  const outfits = outfitsResponse.data.map((row) => {
    const explanation = explanationSchema.parse(row.explanation);
    const proposed = proposedSchema.parse(row.proposed_slots);
    const itemIds = linksResponse.data
      .filter((link) => link.outfit_id === row.id)
      .map((link) => link.wardrobe_item_id);
    if (itemIds.some((itemId) => !owned.has(itemId)))
      throw new ApiError(
        "capsule_items_changed",
        "Some capsule items changed. Edit the capsule before generating fresh outfits.",
        409,
      );
    return {
      id: row.id,
      title: row.title,
      items: itemIds.map((itemId) => owned.get(itemId)!),
      reasons: explanation.whyThis.map((reason) => reason.reason),
      differences: explanation.differences,
      inputsUsed: z
        .object({ signals: z.array(z.string()) })
        .parse(row.inputs_used).signals,
      uncertainty: z.array(z.string()).parse(row.uncertainty),
      requiresAddition: proposed.length > 0,
      proposedItems: proposed.map((slot) => slot.brief),
      evidence: explanation.whyThis,
    };
  });
  const additions: CapsuleAddition[] = z
    .array(
      z.object({
        key: z.string(),
        brief: missingBriefSchema,
        roleGap: z.string(),
        supportingItemIds: z.array(z.uuid()),
        unlockedOutfitIds: z.array(z.uuid()),
      }),
    )
    .parse(capsule.missing_additions)
    .map((addition) => ({
      id: addition.key,
      name: addition.brief.name,
      brief: `${addition.roleGap} ${addition.brief.description}`,
      unlockedOutfitIds: addition.unlockedOutfitIds.filter((outfitId) =>
        outfits.some((outfit) => outfit.id === outfitId),
      ),
      supportingItemNames: addition.supportingItemIds
        .map((itemId) => owned.get(itemId)?.name)
        .filter((name): name is string => Boolean(name)),
    }));
  const result: CapsuleResult = {
    id: capsule.id,
    title: capsule.title,
    templateId: capsule.brief.templateId,
    subtitle: `${capsule.brief.days} days, ${capsule.brief.activities.join(", ")}`,
    pieces: inventory.filter((item) =>
      capsule.brief.includedItemIds.includes(item.id),
    ),
    outfits,
    additions,
  };
  if (completed.error)
    throw new ApiError(
      "capsule_status_unavailable",
      "The capsule status could not be loaded. Try again.",
      503,
      true,
    );
  if (preferences.error)
    throw new ApiError(
      "capsule_preferences_unavailable",
      "The capsule preferences could not be loaded. Retry loading.",
      503,
      true,
    );
  const current = {
    brief: capsule.brief,
    revision: capsule.revision,
    preferenceRevision: preferences.data?.revision ?? 0,
    itemRevisions: Object.fromEntries(
      inventory.map((item) => [item.id, item.revision]),
    ),
    runtime: {
      model: TEXT_MODEL,
      generationConfig: capsuleGenerationConfig(
        TEXT_MODEL,
        capsule.brief.targetOutfits,
        getFashionTaskSettings("capsule_generation"),
      ),
      promptVersion: CAPSULE_PROMPT_VERSION,
      schemaVersion: FASHION_SCHEMA_VERSION,
      knowledgeVersion: FASHION_KNOWLEDGE_VERSION,
    },
  };
  return {
    result,
    revision: capsule.revision,
    brief: capsule.brief,
    generationNeeded: capsuleResultNeedsGeneration(
      completed.data,
      current,
      outfits.map((outfit) => outfit.id),
    ),
    contextKey: capsuleResultContextKey(current),
  };
}

export async function listCapsules(): Promise<CapsuleResult[]> {
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data, error } = await client
    .from("capsules")
    .select(
      "id,title,brief,capsule_items(wardrobe_item_id),capsule_outfits(id,source_revision),revision",
    )
    .eq("workspace_id", workspaceId)
    .eq("capsule_items.workspace_id", workspaceId)
    .eq("capsule_outfits.workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(40);
  if (error)
    throw new ApiError(
      "capsules_read_failed",
      "The capsule collection could not be loaded. Retry loading.",
      503,
      true,
    );
  return data.map((row) => {
    const brief = capsuleBriefSchema.parse(row.brief);
    return {
      id: row.id,
      revision: row.revision,
      title: row.title,
      templateId: brief.templateId,
      pieces: [],
      additions: [],
      outfits: [],
      outfitCount: row.capsule_outfits.filter(
        (outfit) => outfit.source_revision === row.revision,
      ).length,
      pieceCount: row.capsule_items.length,
    };
  });
}
