import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
} from "@/lib/supabase/server";
import { getLookContext } from "./server";

const contextSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  occasion: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .transform((value) => value || null),
});

export async function updateLookContext(lookId: string, input: unknown) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const parsed = contextSchema.parse(input);
  const { look, pieces } = await getLookContext(lookId);
  if (look.source_type === "sample")
    throw new ApiError(
      "sample_read_only",
      "Start with your own image to change this sample.",
      409,
    );
  if (look.revision !== parsed.expectedRevision)
    throw new ApiError(
      "revision_conflict",
      "This inspiration changed. Reload it before saving the occasion.",
      409,
    );
  if (look.occasion === parsed.occasion)
    return {
      lookId: look.id,
      revision: look.revision,
      occasion: look.occasion,
      changed: false,
    };

  const { data, error } = await context.client
    .from("looks")
    .update({
      occasion: parsed.occasion,
      revision: parsed.expectedRevision + 1,
      selected_option_id: null,
      status: pieces.length ? "reviewed" : "draft",
    })
    .eq("workspace_id", context.workspaceId)
    .eq("id", look.id)
    .eq("revision", parsed.expectedRevision)
    .select("id,revision,occasion")
    .maybeSingle();
  if (error)
    throw new ApiError(
      "context_save_failed",
      "The occasion could not be saved. Reload its status and try again.",
      502,
      true,
    );
  if (!data)
    throw new ApiError(
      "revision_conflict",
      "This inspiration changed. Reload it before saving the occasion.",
      409,
    );
  return {
    lookId: data.id,
    revision: data.revision,
    occasion: data.occasion,
    changed: true,
  };
}
