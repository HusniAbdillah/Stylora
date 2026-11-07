import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
} from "@/lib/supabase/server";
import {
  normalizePreferences,
  preferencesFingerprint,
  preferencesSchema,
  preferencesToStorage,
  savePreferencesSchema,
} from "./schema";

const preferenceRowSchema = z.object({
  style_dna: z.record(z.string(), z.unknown()),
  body_profile: z.record(z.string(), z.unknown()),
  fit_preferences: z.record(z.string(), z.unknown()),
  revision: z.number().int().positive(),
});

function toPreferences(row: unknown) {
  const parsed = preferenceRowSchema.parse(row);
  const merged = {
    ...parsed.style_dna,
    ...parsed.body_profile,
    ...parsed.fit_preferences,
  };
  delete merged.skin_depth;
  const preferences = preferencesSchema.parse(merged);
  return {
    preferences,
    revision: parsed.revision,
    fingerprint: preferencesFingerprint(preferences),
  };
}

async function readPreferenceRow() {
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data, error } = await client
    .from("user_preferences")
    .select("style_dna,body_profile,fit_preferences,revision")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error)
    throw new ApiError(
      "preferences_read_failed",
      "Preferences could not be loaded. Try again.",
      503,
      true,
    );
  if (!data)
    throw new ApiError(
      "preferences_not_found",
      "Workspace preferences are unavailable.",
      404,
    );
  return data;
}

export async function getPreferences() {
  return toPreferences(await readPreferenceRow());
}

export async function savePreferences(input: unknown) {
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const parsed = savePreferencesSchema.parse(input);
  const { data, error } = await context.client
    .from("user_preferences")
    .update({
      ...preferencesToStorage(parsed.preferences),
      revision: parsed.expectedRevision + 1,
    })
    .eq("workspace_id", context.workspaceId)
    .eq("revision", parsed.expectedRevision)
    .select("style_dna,body_profile,fit_preferences,revision")
    .maybeSingle();
  if (error)
    throw new ApiError(
      "preferences_save_failed",
      "Preferences could not be saved. Try again.",
      503,
      true,
    );
  if (!data)
    throw new ApiError(
      "revision_conflict",
      "Preferences changed. Reload before saving your draft.",
      409,
    );
  return toPreferences(data);
}

export async function getPersonalizationSnapshot() {
  const row = await readPreferenceRow();
  const current = toPreferences(row);
  return {
    ...current,
    preferences: normalizePreferences(current.preferences),
    preferenceData: {
      styleDna: row.style_dna,
      fitPreferences: row.fit_preferences,
      bodyProfile: row.body_profile,
    },
  };
}
