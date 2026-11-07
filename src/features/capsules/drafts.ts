import "server-only";
import { z } from "zod";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
} from "@/lib/supabase/server";
import { createWorkspaceSignedReads } from "@/lib/supabase/storage";
import {
  capsuleBriefSchema,
  categorySchema,
  draftInputSchema,
  type CapsuleDraftState,
} from "./schema";
import type { CapsuleItem } from "./capsule-types";

export async function getCapsuleDraft(
  id?: string,
): Promise<CapsuleDraftState | null> {
  const { client, workspaceId } = getWorkspaceDatabase();
  let query = client
    .from("workflow_drafts")
    .select("id,revision,payload,current_step,visited_steps,capsule_id")
    .eq("workspace_id", workspaceId)
    .eq("feature_kind", "capsules")
    .eq("status", "active");
  if (id) query = query.eq("id", z.uuid().parse(id));
  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("capsule_draft_read_failed");
  if (!data) return null;
  const step = z.coerce
    .number()
    .int()
    .min(0)
    .max(3)
    .parse(data.current_step ?? 0) as 0 | 1 | 2 | 3;
  const stored = z
    .object({
      brief: capsuleBriefSchema,
      capsuleRevision: z.number().int().positive().optional(),
    })
    .safeParse(data.payload);
  return {
    id: data.id,
    revision: data.revision,
    brief: stored.success
      ? stored.data.brief
      : capsuleBriefSchema.parse(data.payload),
    capsuleId: data.capsule_id ?? undefined,
    capsuleRevision: stored.success ? stored.data.capsuleRevision : undefined,
    step,
    visited: Math.max(
      step,
      ...z.array(z.number().int().min(0).max(3)).parse(data.visited_steps),
    ),
  };
}

export async function getCapsuleInventory(): Promise<CapsuleItem[]> {
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data, error } = await client
    .from("active_owned_wardrobe")
    .select("id,name,category,asset_id,revision")
    .eq("workspace_id", workspaceId)
    .order("name")
    .limit(200);
  if (error) throw new Error("capsule_inventory_read_failed");
  const rows = z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        category: categorySchema,
        asset_id: z.uuid().nullable(),
        revision: z.number().int().positive(),
      }),
    )
    .parse(data);
  // One bulk signing call replaces a lookup and a signature per garment.
  const imageUrls = await createWorkspaceSignedReads(
    rows.flatMap((row) => (row.asset_id ? [row.asset_id] : [])),
  ).catch(() => new Map<string, string>());
  return rows.map((row): CapsuleItem => ({
    id: row.id,
    revision: row.revision,
    name: row.name,
    category: row.category,
    inventoryStatus: "owned",
    imageUrl: row.asset_id ? (imageUrls.get(row.asset_id) ?? null) : null,
  }));
}

export async function saveCapsuleDraft(id: string, input: unknown) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const draftId = z.uuid().parse(id);
  const draft = draftInputSchema.parse(input);
  if (draft.expectedRevision > 0) {
    const existing = await getCapsuleDraft(draftId);
    if (
      existing?.capsuleId !== draft.capsuleId ||
      existing?.capsuleRevision !== draft.capsuleRevision
    )
      return { ok: false as const, code: "draft_conflict" };
  }
  if (draft.capsuleId) {
    const { data, error } = await context.client
      .from("capsules")
      .select("id,revision")
      .eq("workspace_id", context.workspaceId)
      .eq("id", draft.capsuleId)
      .maybeSingle();
    if (error || !data || data.revision !== draft.capsuleRevision)
      return { ok: false as const, code: "draft_conflict" };
  }
  const selectedIds = [
    ...draft.brief.includedItemIds,
    ...draft.brief.excludedItemIds,
  ];
  if (selectedIds.length) {
    const { data, error } = await context.client
      .from("active_owned_wardrobe")
      .select("id")
      .eq("workspace_id", context.workspaceId)
      .in("id", selectedIds);
    if (error || data?.length !== selectedIds.length)
      return { ok: false as const, code: "capsule_items_changed" };
  }
  const values = {
    payload: {
      brief: draft.brief,
      ...(draft.capsuleRevision
        ? { capsuleRevision: draft.capsuleRevision }
        : {}),
    },
    current_step: String(draft.step),
    visited_steps: Array.from(
      { length: draft.visited + 1 },
      (_, index) => index,
    ),
    revision: draft.expectedRevision + 1,
  };
  const query =
    draft.expectedRevision === 0
      ? context.client.from("workflow_drafts").insert({
          ...values,
          id: draftId,
          workspace_id: context.workspaceId,
          feature_kind: "capsules",
          capsule_id: draft.capsuleId ?? null,
        })
      : context.client
          .from("workflow_drafts")
          .update(values)
          .eq("workspace_id", context.workspaceId)
          .eq("id", draftId)
          .eq("feature_kind", "capsules")
          .eq("status", "active")
          .eq("revision", draft.expectedRevision);
  const { data, error } = await query.select("id,revision").maybeSingle();
  if (error?.code === "23505" || (!error && !data)) {
    const existing = await getCapsuleDraft(draftId);
    if (
      existing?.revision === draft.expectedRevision + 1 &&
      existing.step === draft.step &&
      existing.visited === draft.visited &&
      JSON.stringify(existing.brief) === JSON.stringify(draft.brief)
    ) {
      return {
        ok: true as const,
        id: existing.id,
        revision: existing.revision,
      };
    }
  }
  if (error || !data)
    return {
      ok: false as const,
      code:
        error?.code === "23505" || !error
          ? "draft_conflict"
          : "capsule_draft_save_failed",
    };
  return { ok: true as const, id: data.id, revision: data.revision };
}
