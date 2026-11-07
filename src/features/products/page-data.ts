import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/http";
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import { getOutfitDetail } from "@/features/decisions/server";
import { listLookProducts } from "./queries";

export type OutfitPageData = {
  lookId: string;
  activeOptionId: string | null;
  options: {
    id: string;
    type: "closest" | "from_wardrobe" | "fresh_alternative";
    title: string;
    status: string;
    revision: number;
  }[];
  detail: Awaited<ReturnType<typeof getOutfitDetail>> | null;
  shopping: Awaited<ReturnType<typeof listLookProducts>> | null;
  imports: { productId: string; itemId: string; complete: boolean }[];
};

export async function getOutfitPage(
  lookId: string,
  optionId?: string,
): Promise<OutfitPageData> {
  z.uuid().parse(lookId);
  if (optionId) z.uuid().parse(optionId);
  const { client, workspaceId } = getWorkspaceDatabase();
  const [look, options] = await Promise.all([
    client
      .from("looks")
      .select("id,selected_option_id")
      .eq("workspace_id", workspaceId)
      .eq("id", lookId)
      .maybeSingle(),
    client
      .from("outfit_options")
      .select("id,option_type,title,status,revision")
      .eq("workspace_id", workspaceId)
      .eq("look_id", lookId)
      .order("created_at"),
  ]);
  if (look.error || options.error)
    throw new ApiError(
      "OUTFIT_LOAD_FAILED",
      "The outfit could not be loaded. Try again.",
      503,
      true,
    );
  if (!look.data)
    throw new ApiError("OUTFIT_NOT_FOUND", "This outfit is unavailable.", 404);
  const directions = (options.data ?? []).map((option) => ({
    id: option.id,
    type: z
      .enum(["closest", "from_wardrobe", "fresh_alternative"])
      .parse(option.option_type),
    title: option.title,
    status: option.status,
    revision: option.revision,
  }));
  const preferred = optionId ?? look.data.selected_option_id;
  if (optionId && !directions.some((option) => option.id === optionId))
    throw new ApiError(
      "OUTFIT_NOT_FOUND",
      "This outfit direction is unavailable.",
      404,
    );
  const active =
    directions.find(
      (option) =>
        option.id === preferred &&
        (optionId !== undefined || option.status === "ready"),
    ) ??
    directions.find(
      (option) => option.type === "closest" && option.status === "ready",
    ) ??
    directions.find((option) => option.status === "ready");
  if (!active)
    return {
      lookId,
      activeOptionId: null,
      options: directions,
      detail: null,
      shopping: null,
      imports: [],
    };
  const [detail, shopping] = await Promise.all([
    getOutfitDetail(lookId, active.id),
    active.status === "ready"
      ? listLookProducts(lookId, active.id)
      : Promise.resolve(null),
  ]);
  const productIds = [
    ...new Set(
      shopping?.searches.flatMap((search) =>
        search.products.map((product) => product.id),
      ) ?? [],
    ),
  ];
  const imports: OutfitPageData["imports"] = [];
  if (productIds.length) {
    const result = await client
      .from("wardrobe_items")
      .select("id,source_product_id,asset_id")
      .eq("workspace_id", workspaceId)
      .in("source_product_id", productIds)
      .is("archived_at", null);
    if (result.error)
      throw new ApiError(
        "CANDIDATE_LOAD_FAILED",
        "Saved candidates could not be checked. Try again.",
        503,
        true,
      );
    for (const item of result.data ?? [])
      if (item.source_product_id)
        imports.push({
          productId: item.source_product_id,
          itemId: item.id,
          complete: item.asset_id !== null,
        });
  }
  return {
    lookId,
    activeOptionId: active.id,
    options: directions,
    detail,
    shopping,
    imports,
  };
}
