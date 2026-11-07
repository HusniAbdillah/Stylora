import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/http";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
  type WorkspaceDatabase,
} from "@/lib/supabase/server";
import { createWorkspaceSignedRead } from "@/lib/supabase/storage";
import type { Database, Json } from "@/types/database";
import { regenerateMediaSchema, savedMediaState } from "./media";
import {
  cursorSchema,
  saveInputSchema,
  savedListSchema,
  selectionInputSchema,
  type SavedListInput,
} from "./schemas";

type Row<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
type Snapshot = Row<"saved_look_snapshots">;
type Media = Row<"saved_look_media">;

function failure(error: { code?: string; message?: string } | null): void {
  if (!error) return;
  if (error.message === "STYLORA_SAVED_MEDIA_BUSY")
    throw new ApiError(
      "MEDIA_ALREADY_PREPARING",
      "An image is already preparing. Refresh its status.",
      409,
    );
  if (error.message === "STYLORA_SAVED_MEDIA_REVISION_CONFLICT")
    throw new ApiError(
      "MEDIA_REVISION_CONFLICT",
      "The saved image changed. Refresh before generating another.",
      409,
    );
  if (error.code === "40001")
    throw new ApiError(
      "REVISION_CONFLICT",
      "This outfit changed. Reload it and try again.",
      409,
    );
  if (error.code === "P0002")
    throw new ApiError(
      "RESOURCE_NOT_FOUND",
      "The requested outfit is unavailable.",
      404,
    );
  if (error.code === "23514") {
    if (error.message === "STYLORA_MEDIA_RETRY_EXHAUSTED")
      throw new ApiError(
        "MEDIA_RETRY_EXHAUSTED",
        "This image has reached its retry limit.",
        409,
      );
    throw new ApiError(
      "INVALID_COMPOSITION",
      "The selected items are no longer valid for this outfit.",
      409,
    );
  }
  if (["22023", "22P02"].includes(error.code ?? ""))
    throw new ApiError(
      "INVALID_INPUT",
      "Check the supplied fields and try again.",
    );
  throw new ApiError(
    "DATABASE_UNAVAILABLE",
    "The outfit could not be loaded or saved. Try again.",
    503,
    true,
  );
}

function object(value: Json | undefined): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function required<T>(data: T | null): T {
  if (data === null)
    throw new ApiError(
      "DATABASE_UNAVAILABLE",
      "The outfit request returned no result.",
      503,
      true,
    );
  return data;
}

async function signedImage(assetId: string | null) {
  if (!assetId) return null;
  try {
    return (await createWorkspaceSignedRead(assetId)).signedUrl;
  } catch {
    return null;
  }
}

async function resolveMedia(
  context: WorkspaceDatabase,
  savedId: string,
  supplied?: Media | null,
) {
  let media = supplied;
  if (media === undefined) {
    const result = await context.client
      .from("saved_look_media")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .eq("saved_look_id", savedId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    failure(result.error);
    media = result.data;
  }
  if (
    !media ||
    media.workspace_id !== context.workspaceId ||
    media.saved_look_id !== savedId
  )
    return savedMediaState(null, null, false, null, context.writesEnabled);
  const operation = await context.client
    .from("workflow_operations")
    .select(
      "status,attempt_count,safe_error_code,cancel_requested_at,result_ref",
    )
    .eq("workspace_id", context.workspaceId)
    .eq("id", media.operation_id)
    .eq("kind", "saved_avatar")
    .eq("subject_type", "saved_look")
    .eq("subject_id", savedId)
    .maybeSingle();
  failure(operation.error);
  let ready = false;
  let readyMedia = media.status === "succeeded" ? media : null;
  if (!readyMedia) {
    const prior = await context.client
      .from("saved_look_media")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .eq("saved_look_id", savedId)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    failure(prior.error);
    readyMedia = prior.data;
  }
  if (readyMedia?.output_asset_id) {
    const asset = await context.client
      .from("assets")
      .select("id")
      .eq("workspace_id", context.workspaceId)
      .eq("id", readyMedia.output_asset_id)
      .eq("bucket", "previews")
      .eq("status", "ready")
      .maybeSingle();
    failure(asset.error);
    ready = asset.data !== null;
  }
  const imageUrl = ready
    ? await signedImage(readyMedia?.output_asset_id ?? null)
    : null;
  return savedMediaState(
    media,
    operation.data
      ? {
          ...operation.data,
          retryable:
            object(operation.data.result_ref ?? undefined).retryable !== false,
        }
      : null,
    ready,
    media.id === readyMedia?.id ? imageUrl : null,
    context.writesEnabled,
    ready && readyMedia?.output_asset_id
      ? {
          id: readyMedia.id,
          assetId: readyMedia.output_asset_id,
          imageUrl,
        }
      : undefined,
  );
}

async function savedDto(
  context: WorkspaceDatabase,
  saved: Snapshot,
  suppliedMedia?: Media | null,
) {
  if (saved.workspace_id !== context.workspaceId)
    throw new ApiError(
      "RESOURCE_NOT_FOUND",
      "The requested outfit is unavailable.",
      404,
    );
  const [media, share] = await Promise.all([
    resolveMedia(context, saved.id, suppliedMedia),
    context.client
      .from("share_links")
      .select("id,expires_at")
      .eq("workspace_id", context.workspaceId)
      .eq("saved_look_id", saved.id)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  failure(share.error);
  const items = Array.isArray(saved.items)
    ? await Promise.all(
        saved.items.map(async (entry) => {
          const item = object(entry);
          const source = object(item.source_reference);
          const assetId =
            typeof item.asset_id === "string" &&
            z.uuid().safeParse(item.asset_id).success
              ? item.asset_id
              : null;
          const externalImage =
            typeof item.image_url === "string" &&
            z.url({ protocol: /^https$/ }).safeParse(item.image_url).success
              ? item.image_url
              : null;
          return {
            schemaVersion: item.schema_version,
            id: item.id,
            optionItemId: item.option_item_id,
            slotId: item.slot_id,
            name: item.name,
            category: item.category,
            subcategory: item.subcategory,
            description: item.description,
            attributes: item.attributes,
            provenance: item.provenance,
            corrections: item.corrections,
            confidence: item.confidence,
            uncertainty: item.uncertainty,
            revision: item.revision,
            assetId,
            imageUrl: assetId ? await signedImage(assetId) : externalImage,
            ownedAtSave: item.owned_at_save === true,
            inventoryStatus: item.inventory_status,
            sourceReference: { kind: source.kind, id: source.id },
            sourceType: item.source_type,
            sourceLabel: item.source_label,
            priceMinor: item.price_minor ?? null,
            shippingMinor: item.shipping_minor ?? null,
            currency: item.currency ?? null,
          };
        }),
      )
    : [];
  return {
    id: saved.id,
    title: saved.title,
    createdAt: saved.created_at,
    sourceKind: saved.source_kind,
    lookId: saved.look_id,
    optionId: saved.option_id,
    sourceRevision: saved.source_revision,
    selectionRevision: saved.selection_revision,
    items,
    rationale: saved.rationale,
    inputsUsed: saved.inputs_used,
    uncertainty: saved.uncertainty,
    sourceType: saved.source_type,
    spendMinor: saved.spend_minor,
    spendCurrency: saved.spend_currency,
    media,
    activeShare: share.data
      ? { id: share.data.id, expiresAt: share.data.expires_at }
      : null,
  };
}

export async function getSavedLook(savedId: string) {
  z.uuid().parse(savedId);
  const context = getWorkspaceDatabase();
  const result = await context.client
    .from("saved_look_snapshots")
    .select("*")
    .eq("workspace_id", context.workspaceId)
    .eq("id", savedId)
    .maybeSingle();
  failure(result.error);
  if (!result.data)
    throw new ApiError(
      "RESOURCE_NOT_FOUND",
      "The requested outfit is unavailable.",
      404,
    );
  return savedDto(context, result.data);
}

export async function listSavedLooks(input: SavedListInput) {
  const parsed = savedListSchema.parse(input);
  let cursor: z.infer<typeof cursorSchema> | null = null;
  if (parsed.cursor) {
    try {
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(parsed.cursor, "base64url").toString("utf8")),
      );
    } catch {
      throw new ApiError("INVALID_CURSOR", "The saved-look page is invalid.");
    }
  }
  const context = getWorkspaceDatabase();
  const result = await context.client.rpc("list_saved_looks", {
    p_workspace_id: context.workspaceId,
    p_filter: parsed.filter,
    p_limit: parsed.limit,
    ...(cursor
      ? { p_cursor_created_at: cursor.createdAt, p_cursor_id: cursor.id }
      : {}),
  });
  failure(result.error);
  const page = object(result.data);
  const counts = z
    .strictObject({
      all: z.number().int().nonnegative(),
      shared: z.number().int().nonnegative(),
      preparing: z.number().int().nonnegative(),
    })
    .safeParse(page.counts);
  if (
    !counts.success ||
    !Array.isArray(page.items) ||
    typeof page.has_more !== "boolean"
  )
    throw new ApiError(
      "DATABASE_UNAVAILABLE",
      "Saved looks could not be loaded.",
      503,
      true,
    );
  const rows = page.items as unknown as (Snapshot & {
    saved_media: Media | null;
  })[];
  if (
    rows.some(
      (row) =>
        row.workspace_id !== context.workspaceId ||
        !z.uuid().safeParse(row.id).success,
    )
  )
    throw new ApiError(
      "DATABASE_UNAVAILABLE",
      "Saved looks could not be loaded.",
      503,
    );
  const items: Awaited<ReturnType<typeof savedDto>>[] = [];
  for (let offset = 0; offset < rows.length; offset += 6) {
    items.push(
      ...(await Promise.all(
        rows
          .slice(offset, offset + 6)
          .map((row) => savedDto(context, row, row.saved_media)),
      )),
    );
  }
  const last = rows.at(-1);
  return {
    items,
    counts: counts.data,
    nextCursor:
      page.has_more && last
        ? Buffer.from(
            JSON.stringify({ createdAt: last.created_at, id: last.id }),
          ).toString("base64url")
        : null,
  };
}

export async function saveSelection(lookId: string, input: unknown) {
  z.uuid().parse(lookId);
  const parsed = selectionInputSchema.parse(input);
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const result = await context.client.rpc("save_look_selection", {
    p_workspace_id: context.workspaceId,
    p_look_id: lookId,
    p_option_id: parsed.optionId,
    p_expected_revision: parsed.expectedRevision,
    p_choices: parsed.choices.map((choice) => ({
      slot_id: choice.slotId,
      option_item_id: choice.optionItemId,
    })),
  });
  failure(result.error);
  const selection = required(result.data);
  return {
    id: selection.id,
    lookId: selection.look_id,
    optionId: selection.option_id,
    revision: selection.revision,
    sourceOptionRevision: selection.source_option_revision,
    choices: parsed.choices,
  };
}

export async function saveLook(lookId: string, input: unknown) {
  z.uuid().parse(lookId);
  const parsed = saveInputSchema.parse(input);
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const result = await context.client.rpc("save_look_snapshot", {
    p_workspace_id: context.workspaceId,
    p_look_id: lookId,
    p_option_id: parsed.optionId,
    p_expected_revision: parsed.expectedRevision,
    p_idempotency_key: parsed.idempotencyKey,
    p_title: parsed.title,
  });
  failure(result.error);
  return savedDto(context, required(result.data));
}

export async function retrySavedMedia(savedId: string) {
  z.uuid().parse(savedId);
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const result = await context.client.rpc("retry_saved_look_media", {
    p_workspace_id: context.workspaceId,
    p_saved_look_id: savedId,
  });
  failure(result.error);
  return {
    savedLookId: savedId,
    media: await resolveMedia(context, savedId, required(result.data)),
  };
}

export async function regenerateSavedMedia(savedId: string, input: unknown) {
  z.uuid().parse(savedId);
  const parsed = regenerateMediaSchema.parse(input);
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const result = await context.client.rpc("regenerate_saved_look_media", {
    p_workspace_id: context.workspaceId,
    p_saved_look_id: savedId,
    p_expected_media_id: parsed.expectedMediaId,
    p_idempotency_key: parsed.idempotencyKey,
  });
  failure(result.error);
  return {
    savedLookId: savedId,
    media: await resolveMedia(context, savedId, required(result.data)),
  };
}

export async function deleteSavedLook(savedId: string) {
  z.uuid().parse(savedId);
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const result = await context.client.rpc("delete_saved_look", {
    p_workspace_id: context.workspaceId,
    p_saved_look_id: savedId,
  });
  failure(result.error);
  return { id: required(result.data), deleted: true };
}

export async function getOutfitDetail(lookId: string, optionId: string) {
  z.uuid().parse(lookId);
  z.uuid().parse(optionId);
  const context = getWorkspaceDatabase();
  const look = await context.client
    .from("looks")
    .select("id,title,revision,selected_option_id")
    .eq("workspace_id", context.workspaceId)
    .eq("id", lookId)
    .maybeSingle();
  failure(look.error);
  if (!look.data)
    throw new ApiError(
      "RESOURCE_NOT_FOUND",
      "The requested outfit is unavailable.",
      404,
    );
  const [option, candidates, selection] = await Promise.all([
    context.client
      .from("outfit_options")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .eq("look_id", lookId)
      .eq("id", optionId)
      .maybeSingle(),
    context.client
      .from("outfit_option_items")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .eq("look_id", lookId)
      .eq("option_id", optionId)
      .order("position")
      .order("candidate_position"),
    context.client
      .from("look_selections")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .eq("look_id", lookId)
      .eq("option_id", optionId)
      .maybeSingle(),
  ]);
  failure(option.error);
  failure(candidates.error);
  failure(selection.error);
  if (!option.data)
    throw new ApiError(
      "RESOURCE_NOT_FOUND",
      "The requested outfit option is unavailable.",
      404,
    );
  const choiceResult = selection.data
    ? await context.client
        .from("look_selection_items")
        .select("slot_id,option_item_id")
        .eq("workspace_id", context.workspaceId)
        .eq("selection_id", selection.data.id)
        .eq("look_id", lookId)
        .eq("option_id", optionId)
    : { data: [], error: null };
  failure(choiceResult.error);
  const choices = choiceResult.data ?? [];
  const itemRows = candidates.data ?? [];
  const wardrobeIds = [
    ...new Set(
      itemRows.flatMap((item) =>
        item.wardrobe_item_id ? [item.wardrobe_item_id] : [],
      ),
    ),
  ];
  const productIds = [
    ...new Set(
      itemRows.flatMap((item) => (item.product_id ? [item.product_id] : [])),
    ),
  ];
  const [wardrobe, products] = await Promise.all([
    wardrobeIds.length
      ? context.client
          .from("wardrobe_items")
          .select("*")
          .eq("workspace_id", context.workspaceId)
          .in("id", wardrobeIds)
      : { data: [], error: null },
    productIds.length
      ? context.client
          .from("products")
          .select("*")
          .eq("workspace_id", context.workspaceId)
          .in("id", productIds)
      : { data: [], error: null },
  ]);
  failure(wardrobe.error);
  failure(products.error);
  const slots = new Map<
    string,
    {
      slotId: string;
      category: string;
      position: number;
      selectedOptionItemId: string | null;
      candidates: Record<string, unknown>[];
    }
  >();
  for (const item of itemRows) {
    const owned = wardrobe.data?.find(
      (row) => row.id === item.wardrobe_item_id,
    );
    const product = products.data?.find((row) => row.id === item.product_id);
    const brief = object(item.missing_brief ?? undefined);
    const available =
      item.item_kind === "owned"
        ? owned?.inventory_status === "owned" && owned.archived_at === null
        : item.item_kind === "product"
          ? !!product
          : true;
    let slot = slots.get(item.slot_id);
    if (!slot) {
      slot = {
        slotId: item.slot_id,
        category: item.category,
        position: item.position,
        selectedOptionItemId:
          choices.find((choice) => choice.slot_id === item.slot_id)
            ?.option_item_id ?? null,
        candidates: [],
      };
      slots.set(item.slot_id, slot);
    }
    slot.candidates.push({
      optionItemId: item.id,
      kind: item.item_kind,
      available,
      category: item.category,
      wardrobeItemId: item.wardrobe_item_id,
      productId: item.product_id,
      name:
        owned?.name ??
        product?.title ??
        brief.name ??
        item.requested_brief ??
        "Missing item",
      description:
        owned?.description ?? product?.description ?? brief.description ?? null,
      attributes:
        owned?.attributes ?? product?.attributes ?? brief.attributes ?? {},
      imageUrl: owned
        ? await signedImage(owned.asset_id)
        : (product?.image_url ?? null),
      owned: item.item_kind === "owned" && available,
      inventoryStatus: owned?.inventory_status ?? "not_applicable",
      sourceType:
        owned?.source_type ?? product?.source_type ?? option.data.source_type,
      sourceLabel:
        product?.source_label ?? (owned ? "Wardrobe" : "Missing item"),
      priceMinor: product?.price_minor ?? null,
      shippingMinor: product?.shipping_minor ?? null,
      currency: product?.currency ?? null,
      productUrl: product?.product_url ?? null,
      rating: product?.rating ?? null,
      reviewCount: product?.review_count ?? null,
      retrievedAt: product?.retrieved_at ?? null,
      missingBrief: item.missing_brief,
      requestedBrief: item.requested_brief,
      rationale: item.rationale,
    });
  }
  return {
    look: {
      id: look.data.id,
      title: look.data.title,
      revision: look.data.revision,
      selectedOptionId: look.data.selected_option_id,
    },
    option: {
      id: option.data.id,
      type: option.data.option_type,
      title: option.data.title,
      concept: option.data.concept,
      status: option.data.status,
      revision: option.data.revision,
      sourceRevision: option.data.source_revision,
      rationale: option.data.rationale,
      explanation: option.data.explanation,
      inputsUsed: option.data.inputs_used,
      uncertainty: option.data.uncertainty,
    },
    selection: selection.data
      ? {
          id: selection.data.id,
          revision: selection.data.revision,
          sourceOptionRevision: selection.data.source_option_revision,
          isStale:
            selection.data.source_option_revision !== option.data.revision ||
            option.data.source_revision !== look.data.revision,
          choices: choices.map((choice) => ({
            slotId: choice.slot_id,
            optionItemId: choice.option_item_id,
          })),
        }
      : null,
    slots: [...slots.values()],
  };
}
