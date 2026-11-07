"use server";

import { getWorkspaceDatabase } from "@/lib/supabase/server";
import { z } from "zod";
import { readPreviewItems } from "./data";
import { previewDraftInput, validatePreviewSelection } from "./schema";

export async function savePreviewSelection(input: unknown) {
  const parsed = previewDraftInput.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_selection" } as const;
  const { client, workspaceId, writesEnabled } = getWorkspaceDatabase();
  if (!writesEnabled) return { ok: false, code: "writes_disabled" } as const;
  if (
    !validatePreviewSelection(parsed.data.selection, await readPreviewItems())
  )
    return { ok: false, code: "selection_unavailable" } as const;
  const { draftId, revision, selection } = parsed.data;
  if (!draftId) {
    if (revision !== 0)
      return { ok: false, code: "revision_conflict" } as const;
    const { data, error } = await client
      .from("workflow_drafts")
      .insert({
        workspace_id: workspaceId,
        feature_kind: "preview",
        payload: { selection },
        current_step: "selection",
      })
      .select("id,revision")
      .single();
    if (error) return { ok: false, code: "draft_save_failed" } as const;
    return { ok: true, draftId: data.id, revision: data.revision } as const;
  }
  const { data: prior } = await client
    .from("workflow_drafts")
    .select("payload")
    .eq("workspace_id", workspaceId)
    .eq("id", draftId)
    .eq("feature_kind", "preview")
    .eq("status", "active")
    .eq("revision", revision)
    .maybeSingle();
  if (!prior) return { ok: false, code: "revision_conflict" } as const;
  const { data, error } = await client
    .from("workflow_drafts")
    .update({
      payload: {
        ...z.record(z.string(), z.json()).parse(prior.payload),
        selection,
      },
      revision: revision + 1,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", draftId)
    .eq("feature_kind", "preview")
    .eq("status", "active")
    .eq("revision", revision)
    .select("id,revision")
    .maybeSingle();
  if (error) return { ok: false, code: "draft_save_failed" } as const;
  if (!data) return { ok: false, code: "revision_conflict" } as const;
  return { ok: true, draftId: data.id, revision: data.revision } as const;
}
