import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
} from "@/lib/supabase/server";
import {
  createWorkspaceSignedRead,
  createWorkspaceSignedUpload,
  verifyWorkspaceStorageAsset,
} from "@/lib/supabase/storage";
import { garmentProvenance } from "@/lib/ai/fashion-schema";
import {
  applyUserEdit,
  draftPayloadSchema,
  draftValuesSchema,
  itemValuesSchema,
  listQuerySchema,
  mutationSchema,
  revisionSchema,
  saveDraftSchema,
  toCanonicalWardrobeItem,
  uploadSchema,
  valuesByPath,
  type DraftPayload,
} from "./schema";

const asJson = (value: unknown) => z.record(z.string(), z.json()).parse(value);
export function wardrobeDatabaseError(error: { code?: string }): never {
  if (
    error.code === "40001" ||
    error.code === "PT409" ||
    error.code === "55P03"
  )
    throw new ApiError(
      "revision_conflict",
      "This piece or draft changed. Reload it before trying again.",
      409,
    );
  if (error.code === "P0002")
    throw new ApiError(
      "wardrobe_not_found",
      "This piece or draft is unavailable.",
      404,
    );
  if (error.code === "22023" || error.code === "23514")
    throw new ApiError(
      "invalid_wardrobe_change",
      "Check the piece details before saving.",
      400,
    );
  throw new ApiError(
    "wardrobe_unavailable",
    "Your wardrobe could not be loaded or saved. Try again.",
    503,
    true,
  );
}
const emptyPayload = (): DraftPayload => ({
  version: "wardrobe-draft.v1",
  mode: "manual",
  proposals: [],
  saved: {},
  metadata: {},
});
export async function readWardrobeRow(id: string) {
  z.uuid().parse(id);
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data, error } = await client
    .from("wardrobe_items")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error) wardrobeDatabaseError(error);
  if (!data) wardrobeDatabaseError({ code: "P0002" });
  return data;
}
export async function getWardrobeItem(id: string) {
  const item = toCanonicalWardrobeItem(await readWardrobeRow(id));
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data, count, error } = await client
    .from("saved_look_snapshots")
    .select("id,title", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .contains(
      "items",
      JSON.stringify([{ source_reference: { kind: "wardrobe", id } }]),
    )
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) wardrobeDatabaseError(error);
  return {
    ...item,
    savedLookCount: count ?? 0,
    usedIn: data.map((saved) => ({
      id: saved.id,
      title: saved.title,
      imageUrls: [] as string[],
    })),
  };
}
export type WardrobeItemDetailRecord = Awaited<
  ReturnType<typeof getWardrobeItem>
>;

export async function listWardrobeItems(input: unknown = {}) {
  const filter = listQuerySchema.parse(input);
  const { client, workspaceId, writesEnabled } = getWorkspaceDatabase();
  let query = client
    .from("wardrobe_items")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .order("id");
  if (filter.status === "archived")
    query = query.not("archived_at", "is", null);
  else if (filter.status !== "all")
    query = query.is("archived_at", null).eq("inventory_status", filter.status);
  if (filter.category !== "all") query = query.eq("category", filter.category);
  // Fetch in bounded pages; the API never silently truncates the shared inventory.
  const items = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);
    if (error) wardrobeDatabaseError(error);
    items.push(...data.map(toCanonicalWardrobeItem));
    if (data.length < 500) break;
  }
  const q = filter.q.toLocaleLowerCase();
  return {
    items: q
      ? items.filter((item) =>
          JSON.stringify([
            item.name,
            item.subcategory,
            item.description,
            item.attributes,
            item.notes,
          ])
            .toLocaleLowerCase()
            .includes(q),
        )
      : items,
    writesEnabled,
  };
}
export async function listActiveOwnedWardrobe() {
  return (await listWardrobeItems({ status: "owned" })).items;
}
export async function wardrobeImage(id: string) {
  const row = await readWardrobeRow(id);
  if (!row.asset_id) wardrobeDatabaseError({ code: "P0002" });
  return createWorkspaceSignedRead(row.asset_id);
}
export async function readWardrobeDraftRow(id: string) {
  z.uuid().parse(id);
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data, error } = await client
    .from("workflow_drafts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .eq("feature_kind", "wardrobe")
    .maybeSingle();
  if (error) wardrobeDatabaseError(error);
  if (!data) wardrobeDatabaseError({ code: "P0002" });
  draftPayloadSchema.parse(data.payload);
  return data;
}
export function publicDraft(
  row: Awaited<ReturnType<typeof readWardrobeDraftRow>>,
) {
  return {
    id: row.id,
    revision: row.revision,
    status: row.status,
    assetId: row.asset_id,
    payload: draftPayloadSchema.parse(row.payload),
    imageUrl: row.asset_id
      ? `/api/wardrobe/drafts/${row.id}/image?revision=${row.revision}`
      : "",
  };
}
export async function getWardrobeDraft(id: string) {
  return publicDraft(await readWardrobeDraftRow(id));
}
export async function createWardrobeDraft(input: unknown = {}) {
  const { itemId } = z
    .strictObject({ itemId: z.uuid().optional() })
    .parse(input);
  const payload = emptyPayload();
  if (itemId) {
    const item = await getWardrobeItem(itemId);
    payload.editor = {
      itemId,
      baseRevision: item.revision,
      values: itemValuesSchema.parse(item),
      notes: item.notes,
    };
  }
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const { data, error } = await context.client
    .from("workflow_drafts")
    .insert({
      workspace_id: context.workspaceId,
      feature_kind: "wardrobe",
      current_step: "upload",
      visited_steps: ["upload"],
      payload: asJson(payload),
    })
    .select("*")
    .single();
  if (error) wardrobeDatabaseError(error);
  return publicDraft(data);
}
export async function draftCommand(
  id: string,
  revision: number,
  action: string,
  payload: unknown = {},
) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const { data, error } = await context.client.rpc("wardrobe_draft_command", {
    p_workspace_id: context.workspaceId,
    p_draft_id: z.uuid().parse(id),
    p_expected_revision: revisionSchema.parse(revision),
    p_action: action,
    p_payload: asJson(payload),
  });
  if (error) wardrobeDatabaseError(error);
  const result = z.object({ itemId: z.uuid().nullable() }).parse(data);
  return { draft: await getWardrobeDraft(id), itemId: result.itemId };
}
export async function createWardrobeUpload(input: unknown) {
  const parsed = uploadSchema.parse(input);
  const draft = await readWardrobeDraftRow(parsed.draftId);
  if (draft.status !== "active" || draft.revision !== parsed.expectedRevision)
    wardrobeDatabaseError({ code: "40001" });
  const upload = await createWorkspaceSignedUpload({
    bucket: "wardrobe",
    mimeType: parsed.mimeType,
    byteSize: parsed.byteSize,
    sourceType: "manual",
  });
  const payload = draftPayloadSchema.parse(draft.payload);
  const prepared = await draftCommand(draft.id, draft.revision, "save", {
    ...payload,
    pendingUpload: {
      assetId: upload.assetId,
      mimeType: parsed.mimeType,
      byteSize: parsed.byteSize,
    },
  });
  return {
    assetId: upload.assetId,
    signedUrl: upload.signedUrl,
    draft: prepared.draft,
  };
}
export async function verifyWardrobeUpload(id: string, input: unknown) {
  const parsed = z
    .strictObject({ assetId: z.uuid(), expectedRevision: revisionSchema })
    .parse(input);
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const draft = await readWardrobeDraftRow(id);
  if (draft.status !== "active" || draft.revision !== parsed.expectedRevision)
    wardrobeDatabaseError({ code: "40001" });
  if (
    draftPayloadSchema.parse(draft.payload).pendingUpload?.assetId !==
    parsed.assetId
  )
    wardrobeDatabaseError({ code: "P0002" });
  const verified = await verifyWorkspaceStorageAsset(parsed.assetId);
  if (verified.bucket !== "wardrobe") wardrobeDatabaseError({ code: "P0002" });
  return (
    await draftCommand(id, parsed.expectedRevision, "attach", {
      assetId: parsed.assetId,
    })
  ).draft;
}
export async function saveWardrobeDraft(id: string, input: unknown) {
  const parsed = saveDraftSchema.parse(input);
  const draft = await getWardrobeDraft(id);
  const previous = draft.payload.proposals;
  if (
    parsed.proposals.length !== previous.length ||
    new Set(parsed.proposals.map((p) => p.id)).size !== previous.length
  )
    throw new ApiError(
      "invalid_proposals",
      "Reload the draft before editing its pieces.",
    );
  const proposals = parsed.proposals.map((proposal) => {
    const original = previous.find((p) => p.id === proposal.id);
    if (
      !original ||
      (draft.payload.saved[proposal.id] &&
        JSON.stringify(original.values) !== JSON.stringify(proposal.values))
    )
      throw new ApiError(
        "invalid_proposal",
        "This piece has already been saved or is unavailable.",
      );
    return { ...original, values: proposal.values };
  });
  return (
    await draftCommand(
      id,
      parsed.expectedRevision,
      "save",
      draftPayloadSchema.parse({ ...draft.payload, proposals }),
    )
  ).draft;
}
export async function manualWardrobeDraft(id: string, input: unknown) {
  const { expectedRevision } = z
    .strictObject({ expectedRevision: revisionSchema })
    .parse(input);
  const draft = await getWardrobeDraft(id);
  if (!draft.assetId || Object.keys(draft.payload.saved).length)
    throw new ApiError(
      "draft_not_ready",
      "Upload a photo before entering its details.",
      409,
    );
  const proposal = {
    id: randomUUID(),
    values: {
      name: "",
      category: "top" as const,
      subcategory: null,
      description: "",
      attributes: {
        colors: [],
        pattern: null,
        silhouette: null,
        fit: null,
        length: null,
        neckline: null,
        sleeve: null,
        occasion: null,
      },
    },
    original: null,
  };
  // Empty manual labels are a draft state; they must pass itemValuesSchema on confirmation.
  const payload = {
    ...draft.payload,
    mode: "manual",
    proposals: [proposal],
    metadata: {},
  };
  return (await draftCommand(id, expectedRevision, "manual", payload)).draft;
}
export async function confirmWardrobeDraft(id: string, input: unknown) {
  const { expectedRevision, proposalId, values } = z
    .strictObject({
      expectedRevision: revisionSchema,
      proposalId: z.uuid(),
      values: itemValuesSchema,
    })
    .parse(input);
  const draft = await getWardrobeDraft(id);
  const proposal = draft.payload.proposals.find((p) => p.id === proposalId);
  if (!proposal) wardrobeDatabaseError({ code: "P0002" });
  const original = proposal.original;
  const edited = original
    ? applyUserEdit(original, values, {}, 1)
    : { values, corrections: {} };
  const provenance = original
    ? garmentProvenance(
        original,
        draft.assetId,
        z.string().min(1).max(120).parse(draft.payload.metadata.model),
      )
    : Object.fromEntries(
        Object.keys(valuesByPath(values)).map((path) => [
          path,
          {
            source: "user",
            state: "reported",
            confidence: null,
            evidence: "Entered by a visitor in the shared wardrobe.",
            uncertainty: null,
            assetId: draft.assetId,
            provider: null,
            model: null,
          },
        ]),
      );
  return draftCommand(id, expectedRevision, "confirm", {
    ...edited.values,
    proposalId,
    color:
      edited.values.attributes.primaryColor ??
      edited.values.attributes.colors?.[0] ??
      "",
    inferred_attributes: original?.attributes ?? {},
    provenance,
    corrections: edited.corrections,
    confidence: original?.confidence ?? null,
    uncertainty: original?.uncertainty ?? [],
    source_type: original ? "live" : "manual",
  });
}
export async function mutateWardrobeItem(id: string, input: unknown) {
  const parsed = mutationSchema.parse(input);
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const row = await readWardrobeRow(id);
  let payload: unknown = parsed;
  if (parsed.action === "edit") {
    try {
      const edited = applyUserEdit(
        toCanonicalWardrobeItem(row),
        parsed.values,
        row.corrections,
        row.revision + 1,
        parsed.clearCorrections,
      );
      payload = {
        ...edited.values,
        corrections: edited.corrections,
        notes: parsed.notes,
        color:
          edited.values.attributes.primaryColor ??
          edited.values.attributes.colors?.[0] ??
          "",
      };
    } catch (error) {
      if (error instanceof z.ZodError) throw error;
      throw new ApiError(
        "invalid_correction",
        "Check the edited fields and corrections before saving.",
      );
    }
  }
  const { data, error } = await context.client.rpc("wardrobe_item_command", {
    p_workspace_id: context.workspaceId,
    p_item_id: id,
    p_expected_revision: parsed.expectedRevision,
    p_action: parsed.action,
    p_payload: asJson(payload),
  });
  if (error) wardrobeDatabaseError(error);
  return toCanonicalWardrobeItem(data);
}

export async function saveWardrobeEditor(id: string, input: unknown) {
  const { expectedRevision, values, notes } = z
    .strictObject({
      expectedRevision: revisionSchema,
      values: draftValuesSchema,
      notes: z.string().max(4000),
    })
    .parse(input);
  const draft = await getWardrobeDraft(id);
  if (!draft.payload.editor) wardrobeDatabaseError({ code: "P0002" });
  await readWardrobeRow(draft.payload.editor.itemId);
  return (
    await draftCommand(id, expectedRevision, "save", {
      ...draft.payload,
      editor: { ...draft.payload.editor, values, notes },
    })
  ).draft;
}

export async function wardrobePageState() {
  try {
    return { ...(await listWardrobeItems()), error: undefined };
  } catch {
    return {
      items: [],
      writesEnabled: false,
      error:
        "Your wardrobe is unavailable. Retry after checking the connection.",
    };
  }
}
