import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
} from "@/lib/supabase/server";

const saveProfileSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  displayName: z.string().trim().min(1).max(80).nullable(),
});
const profileRowSchema = z.object({
  display_name: z.string().nullable(),
  revision: z.number().int().positive(),
});

function toProfile(row: unknown) {
  const parsed = profileRowSchema.parse(row);
  return {
    displayName: parsed.display_name,
    revision: parsed.revision,
    dataScope: "shared_workspace" as const,
  };
}

export async function getProfile() {
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data, error } = await client
    .from("user_preferences")
    .select("display_name,revision")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error)
    throw new ApiError(
      "profile_read_failed",
      "The shared profile could not be loaded. Try again.",
      503,
      true,
    );
  if (!data)
    throw new ApiError(
      "profile_not_found",
      "The shared profile is unavailable.",
      404,
    );
  return toProfile(data);
}

export async function saveProfile(input: unknown) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const parsed = saveProfileSchema.parse(input);
  const { data, error } = await context.client
    .from("user_preferences")
    .update({
      display_name: parsed.displayName,
      revision: parsed.expectedRevision + 1,
    })
    .eq("workspace_id", context.workspaceId)
    .eq("revision", parsed.expectedRevision)
    .select("display_name,revision")
    .maybeSingle();
  if (error)
    throw new ApiError(
      "profile_save_failed",
      "The shared profile could not be saved. Try again.",
      503,
      true,
    );
  if (!data)
    throw new ApiError(
      "revision_conflict",
      "The shared profile changed. Reload before saving your draft.",
      409,
    );
  return toProfile(data);
}
