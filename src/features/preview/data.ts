import "server-only";
import { z } from "zod";
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import { createWorkspaceSignedRead } from "@/lib/supabase/storage";
import { previewSelectionSchema, slotForPreviewItem } from "./schema";
import { previewImageStatus } from "./generation";
import { FASHION_PROMPT_VERSION, IMAGE_MODEL } from "@/features/ai/openai";
import type { PreviewItem, PreviewSelection } from "./preview-studio";

export async function readPreviewItems(
  includeImages = true,
): Promise<(PreviewItem & { revision: number })[]> {
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data, error } = await client
    .from("wardrobe_items")
    .select("id,name,category,subcategory,asset_id,inventory_status,revision")
    .eq("workspace_id", workspaceId)
    .eq("inventory_status", "owned")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error("PREVIEW_WARDROBE_READ_FAILED");
  return Promise.all(
    (data ?? []).map(async (row) => ({
      id: row.id,
      revision: row.revision,
      name: row.name,
      category: z
        .enum(["top", "bottom", "dress", "outerwear", "shoes", "accessory"])
        .parse(row.category),
      subcategory: row.subcategory,
      inventoryStatus: "owned" as const,
      imageUrl:
        row.asset_id && includeImages
          ? await createWorkspaceSignedRead(row.asset_id)
              .then((asset) => asset.signedUrl)
              .catch(() => null)
          : null,
    })),
  );
}

export type PreviewSource =
  | {
      capsuleId: string;
      outfitId: string;
    }
  | { savedLookId: string };

export async function readPreview(source?: PreviewSource, draftId?: string) {
  const { client, workspaceId, writesEnabled } = getWorkspaceDatabase();
  const [items, draftResult, preferencesResult] = await Promise.all([
    readPreviewItems(),
    client
      .from("workflow_drafts")
      .select("id,revision,payload")
      .eq("workspace_id", workspaceId)
      .eq("feature_kind", "preview")
      .match(draftId ? { id: draftId } : {})
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("user_preferences")
      .select("display_name,style_dna,body_profile,fit_preferences,revision")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);
  if (draftResult.error || preferencesResult.error)
    throw new Error("PREVIEW_READ_FAILED");
  if (draftId && !draftResult.data) throw new Error("PREVIEW_NOT_FOUND");
  const payload = z
    .object({ selection: previewSelectionSchema.optional() })
    .parse(draftResult.data?.payload ?? {});
  const preferences = preferencesResult.data;
  const values = z.record(z.string(), z.unknown()).parse({
    ...z.record(z.string(), z.unknown()).parse(preferences?.style_dna ?? {}),
    ...z.record(z.string(), z.unknown()).parse(preferences?.body_profile ?? {}),
    ...z
      .record(z.string(), z.unknown())
      .parse(preferences?.fit_preferences ?? {}),
  });
  const text = (key: string) => {
    const value = values[key];
    return typeof value === "string" &&
      !["unsure", "unknown", "skip"].includes(value)
      ? value
      : undefined;
  };
  const image =
    draftResult.data && !source
      ? await previewImageStatus(draftResult.data.id)
      : { job: { status: "idle" as const }, operationId: null };
  let staleNotice: string | undefined;
  if (image.job.status === "succeeded" && image.operationId) {
    const { data: operation, error } = await client
      .from("workflow_operations")
      .select("input,prompt_version,model")
      .eq("workspace_id", workspaceId)
      .eq("id", image.operationId)
      .eq("kind", "preview_image")
      .maybeSingle();
    if (error || !operation) throw new Error("PREVIEW_STATUS_READ_FAILED");
    const snapshot = z
      .object({
        items: z.array(
          z.object({ id: z.uuid(), revision: z.number().int().positive() }),
        ),
        preferences: z.object({ revision: z.number().int().positive() }),
      })
      .parse(operation.input);
    if (
      operation.prompt_version !== FASHION_PROMPT_VERSION ||
      operation.model !== IMAGE_MODEL ||
      snapshot.preferences.revision !== preferences?.revision ||
      snapshot.items.some(
        (item) =>
          !items.some(
            (current) =>
              current.id === item.id && current.revision === item.revision,
          ),
      )
    ) {
      image.job = { status: "idle" };
      image.operationId = null;
      staleNotice =
        "Your wardrobe or preferences changed. Review the current selection.";
    }
  }
  if (!process.env.OPENAI_API_KEY?.trim() && !process.env.MODEL_API_KEY?.trim())
    image.job = { status: "unavailable" };
  let selection = (payload.selection ?? {}) as PreviewSelection;
  let seedNotice: string | undefined;
  let proposedNames: string[] = [];
  if (source && "capsuleId" in source) {
    const [outfit, membership, capsule] = await Promise.all([
      client
        .from("capsule_outfits")
        .select("source_revision,proposed_slots")
        .eq("workspace_id", workspaceId)
        .eq("capsule_id", source.capsuleId)
        .eq("id", source.outfitId)
        .maybeSingle(),
      client
        .from("capsule_outfit_items")
        .select("wardrobe_item_id")
        .eq("workspace_id", workspaceId)
        .eq("capsule_id", source.capsuleId)
        .eq("outfit_id", source.outfitId),
      client
        .from("capsules")
        .select("revision")
        .eq("workspace_id", workspaceId)
        .eq("id", source.capsuleId)
        .maybeSingle(),
    ]);
    if (
      outfit.error ||
      membership.error ||
      capsule.error ||
      !outfit.data ||
      !capsule.data ||
      outfit.data.source_revision !== capsule.data.revision
    )
      throw new Error("CAPSULE_PREVIEW_UNAVAILABLE");
    selection = {};
    seedNotice =
      "This preview uses selected owned pieces. Proposed additions stay in your capsule.";
    for (const member of membership.data ?? []) {
      const item = items.find(
        (candidate) => candidate.id === member.wardrobe_item_id,
      );
      if (!item) {
        seedNotice =
          "Some capsule pieces are unavailable. Review the preview choices.";
        continue;
      }
      const slot = slotForPreviewItem(item);
      if (selection[slot]) {
        seedNotice =
          "This outfit has multiple pieces in a category. Review the preview choices.";
        continue;
      }
      selection[slot] = item.id;
    }
    proposedNames = z
      .array(z.object({ brief: z.object({ name: z.string().max(160) }) }))
      .parse(outfit.data.proposed_slots)
      .map((slot) => slot.brief.name);
  } else if (source) {
    const { data: saved, error } = await client
      .from("saved_look_snapshots")
      .select("items")
      .eq("workspace_id", workspaceId)
      .eq("id", source.savedLookId)
      .maybeSingle();
    if (error || !saved) throw new Error("SAVED_PREVIEW_UNAVAILABLE");
    const snapshotItems = z
      .array(
        z.object({
          id: z.uuid().nullable(),
          name: z.string().max(160),
          source_reference: z
            .object({ kind: z.string(), id: z.uuid().nullable() })
            .optional(),
        }),
      )
      .parse(saved.items);
    selection = {};
    seedNotice =
      "Review pieces currently in your wardrobe. Open Saved looks for the original composition and image.";
    for (const snapshot of snapshotItems) {
      let item = items.find((candidate) => candidate.id === snapshot.id);
      if (
        !item &&
        snapshot.source_reference?.kind === "product" &&
        snapshot.id
      ) {
        const { data: imported } = await client
          .from("wardrobe_items")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("inventory_status", "owned")
          .is("archived_at", null)
          .eq("source_product_id", snapshot.id)
          .limit(1)
          .maybeSingle();
        item = items.find((candidate) => candidate.id === imported?.id);
      }
      if (!item) {
        proposedNames.push(snapshot.name);
        continue;
      }
      const slot = slotForPreviewItem(item);
      if (selection[slot]) {
        proposedNames.push(snapshot.name);
        seedNotice =
          "This saved look has multiple pieces in a category. Review the preview choices.";
        continue;
      }
      selection[slot] = item.id;
    }
  }
  return {
    job:
      source && image.job.status !== "unavailable"
        ? { status: "idle" as const }
        : image.job,
    operationId: source ? null : image.operationId,
    items,
    draftId: source ? null : (draftResult.data?.id ?? null),
    revision: source ? 0 : (draftResult.data?.revision ?? 0),
    selection,
    selectionValid: Object.entries(selection).every(([slot, id]) =>
      items.some((item) => item.id === id && slotForPreviewItem(item) === slot),
    ),
    seed: !!source,
    seedNotice,
    staleNotice,
    proposedNames,
    extraPiecesLabel:
      source && "savedLookId" in source
        ? "Other snapshot pieces"
        : "Proposed additions",
    writesEnabled,
    displayName: preferences?.display_name ?? "Studio guest",
    profileSummary: {
      swatchLabel: [text("skinSwatchId"), text("skinSwatchHex")]
        .filter(Boolean)
        .join(" "),
      undertone: text("undertone"),
      bodyReference: [text("bodyIllustrationId"), text("fit")]
        .filter(Boolean)
        .join(", "),
    },
  };
}
