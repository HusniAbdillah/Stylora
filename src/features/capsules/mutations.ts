import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
} from "@/lib/supabase/server";
import { capsuleBriefSchema } from "./schema";

const revisionSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
});

export async function updateCapsule(id: string, input: unknown) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const parsed = z
    .strictObject({
      expectedRevision: z.number().int().positive(),
      title: z.string().trim().min(1).max(160),
      brief: capsuleBriefSchema,
    })
    .parse(input);
  const { data, error } = await context.client.rpc("save_capsule_draft", {
    p_workspace_id: context.workspaceId,
    p_capsule_id: z.uuid().parse(id),
    p_expected_revision: parsed.expectedRevision,
    p_title: parsed.title,
    p_brief: parsed.brief,
    p_item_ids: parsed.brief.includedItemIds,
  });
  if (error)
    throw new ApiError(
      "capsule_update_conflict",
      "This capsule changed. Your edits are kept. Reload before applying them.",
      409,
    );
  return data;
}

export async function deleteCapsule(
  id: string,
  input: unknown,
  outfitId?: string,
) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const capsuleId = z.uuid().parse(id);
  const parsed = revisionSchema.parse(input);
  const args = {
    p_workspace_id: context.workspaceId,
    p_capsule_id: capsuleId,
    p_expected_revision: parsed.expectedRevision,
  };
  const result = outfitId
    ? await context.client.rpc("delete_capsule_outfit", {
        ...args,
        p_outfit_id: z.uuid().parse(outfitId),
      })
    : await context.client.rpc("delete_capsule", args);
  if (result.error)
    throw new ApiError(
      "capsule_delete_conflict",
      "This capsule changed. Reload it before deleting.",
      409,
    );
  return { capsuleId, deleted: true };
}
