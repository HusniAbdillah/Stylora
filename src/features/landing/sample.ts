import "server-only";
import { z } from "zod";
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import { createWorkspaceSignedReads } from "@/lib/supabase/storage";
import { storedLandingSampleSchema } from "./sample-schema";
import { evaluateCandidate, type MatchItem } from "@/features/matching/gates";
import { attributesSchema, categorySchema } from "@/lib/ai/fashion-schema";

export async function getLandingSample() {
  const sampleId = z
    .uuid()
    .safeParse(process.env.STYLORA_LANDING_SAMPLE_LOOK_ID);
  if (!sampleId.success) return null;
  try {
    const { client, workspaceId } = getWorkspaceDatabase();
    const [lookResult, operationResult] = await Promise.all([
      client
        .from("looks")
        .select("id,inspiration_asset_id")
        .eq("workspace_id", workspaceId)
        .eq("id", sampleId.data)
        .eq("source_type", "sample")
        .maybeSingle(),
      client
        .from("workflow_operations")
        .select("id,model,completed_at")
        .eq("workspace_id", workspaceId)
        .eq("subject_id", sampleId.data)
        .eq("subject_type", "look")
        .eq("status", "succeeded")
        .eq("kind", "inspiration_description")
        .limit(1)
        .maybeSingle(),
    ]);
    const look = lookResult.data;
    const operation = operationResult.data;
    if (
      lookResult.error ||
      operationResult.error ||
      !look?.inspiration_asset_id ||
      !operation
    )
      return null;
    const { data: event } = await client
      .from("workflow_operation_events")
      .select("payload")
      .eq("workspace_id", workspaceId)
      .eq("operation_id", operation.id)
      .eq("sequence", 1)
      .maybeSingle();
    const parsed = storedLandingSampleSchema.safeParse(event?.payload);
    if (!parsed.success) return null;
    const members = parsed.data.wardrobe.length
      ? await client
          .from("wardrobe_items")
          .select("id,asset_id")
          .eq("workspace_id", workspaceId)
          .in(
            "id",
            parsed.data.wardrobe.map((item) => item.id),
          )
          .eq("source_type", "sample")
          .eq("inventory_status", "owned")
          .is("archived_at", null)
      : { data: [], error: null };
    if (members.error) return null;
    const membership = new Map(
      (members.data ?? []).map((item) => [item.id, item]),
    );
    const images = await createWorkspaceSignedReads([
      look.inspiration_asset_id,
      ...(members.data ?? []).flatMap((item) =>
        item.asset_id ? [item.asset_id] : [],
      ),
    ]);
    const imageUrl = images.get(look.inspiration_asset_id);
    if (!imageUrl) return null;
    const wardrobe = parsed.data.wardrobe.map((item) => {
      const current = membership.get(item.id);
      return {
        ...item,
        available: Boolean(current),
        imageUrl: current?.asset_id
          ? (images.get(current.asset_id) ?? null)
          : null,
      };
    });
    const pieces = parsed.data.description.pieces;
    const matches = pieces.map((piece, index) => {
      const source: MatchItem = {
        id: String(index),
        name: piece.name,
        category: categorySchema.parse(piece.category),
        subcategory: null,
        attributes: attributesSchema.parse(piece.attributes),
        sourceType: "sample",
        revision: 1,
      };
      const candidates = wardrobe
        .filter((item) => item.available)
        .map((item) => ({
          item,
          gate: evaluateCandidate(source, {
            id: item.id,
            name: item.name,
            category: categorySchema.parse(item.category),
            subcategory: null,
            attributes: attributesSchema.parse(item.attributes),
            sourceType: "sample",
            revision: 1,
            inventoryStatus: "owned",
            archivedAt: null,
          }),
        }))
        .filter((entry) => entry.gate.eligible)
        .sort((a, b) => b.gate.score - a.gate.score);
      const best = candidates[0];
      return {
        name: best?.item.name ?? piece.name,
        inspirationName: piece.name,
        outcome: best
          ? best.gate.score >= 0.8 && best.gate.evidenceCoverage >= 0.25
            ? ("owned" as const)
            : ("alternative" as const)
          : ("missing" as const),
        wardrobeItemId: best?.item.id ?? null,
        imageUrl: best?.item.imageUrl ?? null,
      };
    });
    return {
      id: look.id,
      imageUrl,
      pieces,
      matches,
      confidence: parsed.data.confidence,
      ideas: parsed.data.ideas,
      model: operation.model,
      preparedAt: operation.completed_at,
    };
  } catch {
    return null;
  }
}
