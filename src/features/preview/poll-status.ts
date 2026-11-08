import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import { operationStatusSchema } from "@/features/operations/schema";

export async function previewPollStatus(draftId: string) {
  const id = z.uuid().parse(draftId).toLowerCase();
  const { client, workspaceId } = getWorkspaceDatabase();
  const draft = await client
    .from("workflow_drafts")
    .select("id,workspace_id,revision,payload")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .eq("feature_kind", "preview")
    .eq("status", "active")
    .maybeSingle();
  if (draft.error) throw unavailable();
  if (
    !draft.data ||
    draft.data.workspace_id !== workspaceId ||
    draft.data.id !== id
  )
    throw new ApiError(
      "preview_not_found",
      "This preview is unavailable.",
      404,
    );

  const [latest, preferences] = await Promise.all([
    client
      .from("workflow_operations")
      .select(
        "id,workspace_id,subject_id,input_revision,status,created_at,completed_at",
      )
      .eq("workspace_id", workspaceId)
      .eq("subject_type", "draft")
      .eq("subject_id", id)
      .eq("kind", "preview_image")
      .eq("input_revision", draft.data.revision)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("user_preferences")
      .select("workspace_id,revision")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);
  if (latest.error || preferences.error) throw unavailable();
  const operation = latest.data;
  if (
    (operation &&
      (operation.workspace_id !== workspaceId ||
        operation.subject_id !== id ||
        operation.input_revision !== draft.data.revision)) ||
    (preferences.data && preferences.data.workspace_id !== workspaceId)
  )
    throw unavailable();
  const payload = z
    .object({ renderRequestId: z.uuid().optional() })
    .parse(draft.data.payload);
  return {
    mode: "poll" as const,
    draftId: id,
    revision: draft.data.revision,
    renderRequestId: payload.renderRequestId,
    preferenceRevision: preferences.data?.revision ?? 0,
    operationId: operation?.id ?? null,
    operationStatus: operation
      ? operationStatusSchema.parse(operation.status)
      : null,
    elapsedSeconds: operation?.completed_at
      ? Math.max(
          0,
          Math.round(
            (Date.parse(operation.completed_at) -
              Date.parse(operation.created_at)) /
              1000,
          ),
        )
      : undefined,
  };
}

function unavailable() {
  return new ApiError(
    "preview_status_failed",
    "Image status could not be loaded.",
    503,
    true,
  );
}
