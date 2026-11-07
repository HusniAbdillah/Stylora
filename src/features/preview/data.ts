import "server-only";
import { z } from "zod";
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import { createWorkspaceSignedRead } from "@/lib/supabase/storage";
import { previewSelectionSchema } from "./schema";
import type { PreviewItem, PreviewSelection } from "./preview-studio";

export async function readPreviewItems(): Promise<PreviewItem[]> {
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data, error } = await client
    .from("wardrobe_items")
    .select("id,name,category,subcategory,asset_id,inventory_status")
    .eq("workspace_id", workspaceId)
    .eq("inventory_status", "owned")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error("PREVIEW_WARDROBE_READ_FAILED");
  return Promise.all(
    (data ?? []).map(async (row) => ({
      id: row.id,
      name: row.name,
      category: z
        .enum(["top", "bottom", "dress", "outerwear", "shoes", "accessory"])
        .parse(row.category),
      subcategory: row.subcategory,
      inventoryStatus: "owned" as const,
      imageUrl: row.asset_id
        ? await createWorkspaceSignedRead(row.asset_id)
            .then((asset) => asset.signedUrl)
            .catch(() => null)
        : null,
    })),
  );
}

export async function readPreview() {
  const { client, workspaceId, writesEnabled } = getWorkspaceDatabase();
  const [items, draftResult, preferencesResult] = await Promise.all([
    readPreviewItems(),
    client
      .from("workflow_drafts")
      .select("id,revision,payload")
      .eq("workspace_id", workspaceId)
      .eq("feature_kind", "preview")
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
  const text = (key: string) =>
    typeof values[key] === "string" ? (values[key] as string) : undefined;
  return {
    items,
    draftId: draftResult.data?.id ?? null,
    revision: draftResult.data?.revision ?? 0,
    selection: (payload.selection ?? {}) as PreviewSelection,
    writesEnabled,
    displayName: preferences?.display_name ?? "Studio guest",
    profileSummary: {
      swatchLabel: [text("skinSwatchId"), text("skinSwatchHex")]
        .filter(Boolean)
        .join(" "),
      undertone: text("undertone"),
      bodyReference: text("bodyShape") ?? text("body_shape"),
    },
  };
}
