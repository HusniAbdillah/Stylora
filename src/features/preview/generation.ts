import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
} from "@/lib/supabase/server";
import { createWorkspaceSignedRead } from "@/lib/supabase/storage";
import {
  startOperation,
  runOperation,
  assertWorkflowRpc,
} from "@/features/operations/server";
import {
  FASHION_PROMPT_VERSION,
  FASHION_SCHEMA_VERSION,
  FASHION_KNOWLEDGE_VERSION,
  IMAGE_MODEL,
} from "@/features/ai/openai";
import {
  normalizeAvatarItems,
  avatarRenderFingerprint,
  renderAndStoreAvatar,
  discardPendingAvatar,
  getAvatarRenderSettings,
} from "./image";
import { imageRenderSettingsSchema } from "@/features/ai/image-settings";
import { buildAvatarVisualDirection } from "./visual-direction";
import { previewSelectionSchema, slotForPreviewItem } from "./schema";
import type { PreviewJob } from "./preview-studio";
import { isCurrentPreviewContext, previewJobStatus } from "./job-status";

const generationInput = z.strictObject({
  draftId: z.uuid(),
  expectedRevision: z.number().int().positive(),
  renderRequestId: z.uuid().optional(),
});

export async function readPreviewImageInputs(draftId: string) {
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data: draft, error } = await client
    .from("workflow_drafts")
    .select("id,revision,payload")
    .eq("workspace_id", workspaceId)
    .eq("id", z.uuid().parse(draftId))
    .eq("feature_kind", "preview")
    .eq("status", "active")
    .maybeSingle();
  if (error || !draft)
    throw new ApiError(
      "preview_not_found",
      "This preview is unavailable.",
      404,
    );
  const { selection } = z
    .object({ selection: previewSelectionSchema })
    .parse(draft.payload);
  const ids = Object.values(selection).filter((id): id is string => !!id);
  if (!ids.length)
    throw new ApiError("empty_selection", "Choose at least one piece.");
  const [wardrobe, preferences] = await Promise.all([
    client
      .from("wardrobe_items")
      .select(
        "id,name,category,subcategory,description,attributes,inferred_attributes,corrections,provenance,revision,asset_id",
      )
      .eq("workspace_id", workspaceId)
      .eq("inventory_status", "owned")
      .is("archived_at", null)
      .in("id", ids),
    client
      .from("user_preferences")
      .select("revision,style_dna,body_profile,fit_preferences,style_notes")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);
  if (wardrobe.error || preferences.error || !preferences.data)
    throw new ApiError(
      "preview_input_unavailable",
      "Preview inputs could not be loaded. Try again.",
      503,
      true,
    );
  const items = normalizeAvatarItems(wardrobe.data ?? []);
  if (
    items.length !== ids.length ||
    items.some(
      (item) =>
        selection[slotForPreviewItem(item)] !== item.id || !item.asset_id,
    )
  )
    throw new ApiError(
      "selection_unavailable",
      "A selected piece is unavailable. Choose a replacement.",
      409,
    );
  const snapshot = z.json().parse(preferences.data);
  const renderSettings = getAvatarRenderSettings();
  const renderFingerprint = avatarRenderFingerprint(
    items,
    snapshot,
    renderSettings,
  );
  return {
    draft,
    items,
    preferences: snapshot,
    renderFingerprint,
    renderSettings,
  };
}

export async function previewImageStatus(draftId: string) {
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data: draft } = await client
    .from("workflow_drafts")
    .select("id,revision,payload")
    .eq("workspace_id", workspaceId)
    .eq("id", z.uuid().parse(draftId))
    .eq("feature_kind", "preview")
    .eq("status", "active")
    .maybeSingle();
  if (!draft)
    throw new ApiError(
      "preview_not_found",
      "This preview is unavailable.",
      404,
    );
  const [latest, ready, inputs] = await Promise.all([
    client
      .from("workflow_operations")
      .select(
        "id,status,input,prompt_version,model,result_ref,created_at,completed_at,safe_error_code",
      )
      .eq("workspace_id", workspaceId)
      .eq("subject_type", "draft")
      .eq("subject_id", draft.id)
      .eq("kind", "preview_image")
      .eq("input_revision", draft.revision)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("workflow_operations")
      .select("result_ref")
      .eq("workspace_id", workspaceId)
      .eq("subject_type", "draft")
      .eq("subject_id", draft.id)
      .eq("kind", "preview_image")
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    readPreviewImageInputs(draft.id).catch((error: unknown) => {
      if (
        error instanceof ApiError &&
        ["empty_selection", "selection_unavailable"].includes(error.code)
      )
        return null;
      throw error;
    }),
  ]);
  if (latest.error || ready.error)
    throw new ApiError(
      "preview_status_failed",
      "Image status could not be loaded.",
      503,
      true,
    );
  const operation = latest.data;
  let preferenceRevision: number;
  if (inputs) {
    preferenceRevision = z
      .object({ revision: z.number().int().nonnegative() })
      .parse(inputs.preferences).revision;
  } else {
    const preferences = await client
      .from("user_preferences")
      .select("revision")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (preferences.error)
      throw new ApiError(
        "preview_status_failed",
        "Preferences could not be loaded. Try again.",
        503,
        true,
      );
    preferenceRevision = preferences.data?.revision ?? 0;
  }
  const outdated =
    !!operation &&
    (!inputs ||
      !isCurrentPreviewContext(operation, {
        renderFingerprint: inputs.renderFingerprint,
        promptVersion: FASHION_PROMPT_VERSION,
        model: IMAGE_MODEL,
      }));
  let job: PreviewJob = { status: "idle" };
  let operationId = operation?.id ?? null;
  if (operation) {
    if (operation.status === "superseded") operationId = null;
    job = {
      status: previewJobStatus(operation.status),
      superseded: operation.status === "superseded",
      elapsedSeconds: operation.completed_at
        ? Math.round(
            (Date.parse(operation.completed_at) -
              Date.parse(operation.created_at)) /
              1000,
          )
        : undefined,
      errorMessage:
        "The image could not finish. Your selection is kept. Retry image to continue.",
    };
    if (operation.status === "succeeded") {
      const result = z
        .object({ assetId: z.uuid() })
        .parse(operation.result_ref);
      try {
        job.imageUrl = (
          await createWorkspaceSignedRead(result.assetId)
        ).signedUrl;
      } catch {
        job = {
          status: "failed",
          errorMessage:
            "This image is unavailable. Generate another image from your saved selection.",
        };
        operationId = null;
      }
    }
  }
  if (outdated) {
    job = { status: "idle", superseded: !!inputs, imageUrl: job.imageUrl };
    operationId = null;
  }
  if (!job.imageUrl && ready.data) {
    const result = z.object({ assetId: z.uuid() }).parse(ready.data.result_ref);
    try {
      job.imageUrl = (
        await createWorkspaceSignedRead(result.assetId)
      ).signedUrl;
    } catch {
      job.errorMessage ??=
        "The previous image is unavailable. Generate an image from your selection.";
    }
  }
  if (!operation && job.imageUrl && inputs) job.superseded = true;
  const imageOutdated =
    !!job.imageUrl && (outdated || job.status !== "succeeded");
  const payload = z
    .object({ renderRequestId: z.uuid().optional() })
    .parse(draft.payload);
  return {
    draftId: draft.id,
    revision: draft.revision,
    operationId,
    job,
    renderRequestId: payload.renderRequestId,
    preferenceRevision,
    imageOutdated,
    staleNotice: outdated
      ? "Your wardrobe or preferences changed. The previous image is shown."
      : undefined,
    renderSettings: inputs?.renderSettings ?? getAvatarRenderSettings(),
  };
}

export async function generatePreviewImage(input: unknown) {
  const parsed = generationInput.parse(input);
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  if (!process.env.OPENAI_API_KEY?.trim() && !process.env.MODEL_API_KEY?.trim())
    throw new ApiError(
      "image_unavailable",
      "Image generation is unavailable right now.",
      503,
    );
  await assertWorkflowRpc("complete_preview_operation");
  let current = await readPreviewImageInputs(parsed.draftId);
  const payload = z.record(z.string(), z.json()).parse(current.draft.payload);
  const repeatedRender =
    parsed.renderRequestId &&
    payload.renderRequestId === parsed.renderRequestId;
  if (!repeatedRender && current.draft.revision !== parsed.expectedRevision)
    throw new ApiError(
      "revision_conflict",
      "This preview changed. Reload before generating.",
      409,
    );
  if (parsed.renderRequestId && !repeatedRender) {
    const { data, error } = await context.client
      .from("workflow_drafts")
      .update({
        payload: { ...payload, renderRequestId: parsed.renderRequestId },
        revision: current.draft.revision + 1,
      })
      .eq("workspace_id", context.workspaceId)
      .eq("id", parsed.draftId)
      .eq("feature_kind", "preview")
      .eq("status", "active")
      .eq("revision", parsed.expectedRevision)
      .select("id")
      .maybeSingle();
    if (error || !data)
      throw new ApiError(
        "revision_conflict",
        "This preview changed. Reload before generating.",
        409,
      );
    current = await readPreviewImageInputs(parsed.draftId);
  }
  const inputFingerprint = createHash("sha256")
    .update(
      `${current.draft.id}:${current.draft.revision}:${current.renderFingerprint}`,
    )
    .digest("hex");
  const operation = await startOperation({
    kind: "preview_image",
    subjectType: "draft",
    subjectId: current.draft.id,
    inputRevision: current.draft.revision,
    inputFingerprint,
    input: z.record(z.string(), z.json()).parse({
      items: current.items,
      preferences: current.preferences,
      renderFingerprint: current.renderFingerprint,
      renderSettings: current.renderSettings,
      visualDirection: buildAvatarVisualDirection(
        current.preferences,
        current.items,
      ),
      knowledgeVersion: FASHION_KNOWLEDGE_VERSION,
    }),
    promptVersion: FASHION_PROMPT_VERSION,
    schemaVersion: FASHION_SCHEMA_VERSION,
    model: IMAGE_MODEL,
  });
  await runOperation(operation.id, {
    execute: async (claim) =>
      renderAndStoreAvatar({
        items: z.array(z.unknown()).parse(claim.input.items),
        preferences: claim.input.preferences,
        renderSettings: imageRenderSettingsSchema.parse(
          claim.input.renderSettings,
        ),
        reuse: !parsed.renderRequestId,
        signal: claim.signal,
      }),
    commit: async (claim, output) => {
      try {
        const { data, error } = await context.client.rpc(
          "complete_preview_operation",
          {
            p_workspace_id: context.workspaceId,
            p_operation_id: claim.operationId,
            p_attempt_count: claim.attemptCount,
            p_input_fingerprint: claim.inputFingerprint,
            p_output_asset_id: output.assetId,
            p_render_fingerprint: output.renderFingerprint,
          },
        );
        if (error)
          throw new ApiError(
            "preview_commit_failed",
            "The image could not be attached. Retry image.",
            503,
            true,
          );
        const committed = z.object({ status: z.string() }).parse(data);
        if (committed.status !== "succeeded" && output.createdAsset)
          await discardPendingAvatar(output.assetId);
      } catch (error) {
        if (output.createdAsset) await discardPendingAvatar(output.assetId);
        throw error;
      }
    },
  });
  return previewImageStatus(parsed.draftId);
}
