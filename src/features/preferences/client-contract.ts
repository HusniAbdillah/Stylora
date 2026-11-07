import { z } from "zod";
import { withFeedback } from "@/lib/feedback/store";
import { requestNotice } from "@/lib/feedback/request";
import { skinSwatchOptions } from "./preferences-types";

const optionalChoice = (choices: readonly [string, ...string[]]) =>
  z.enum(choices).nullable().optional();
const optionalList = z.array(z.string().max(120)).max(16).optional();

export const preferencesClientSchema = z.strictObject({
  skinSwatchId: optionalChoice([
    "depth_01",
    "depth_02",
    "depth_03",
    "depth_04",
    "depth_05",
    "depth_06",
  ]),
  skinSwatchHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  undertone: optionalChoice([
    "warm",
    "cool",
    "neutral",
    "olive",
    "unsure",
    "unknown",
  ]),
  contrast: optionalChoice(["soft", "medium", "strong", "unsure", "unknown"]),
  bodyIllustrationGroup: z.enum(["women", "men"]).nullable().optional(),
  bodyIllustrationId: optionalChoice([
    "hourglass",
    "pear",
    "round",
    "rectangle",
    "inverted_triangle",
  ]),
  fit: optionalChoice([
    "fitted",
    "regular",
    "relaxed",
    "oversized",
    "unsure",
    "unknown",
  ]),
  proportions: optionalList,
  styles: optionalList,
  colorFamilies: optionalList,
  occasions: optionalList,
  climate: optionalList,
  coverage: optionalList,
  lengths: optionalList,
  layering: optionalList,
  fabricDislikes: optionalList,
  footwearComfort: optionalList,
  careTolerance: optionalList,
});

export const preferencesSnapshotSchema = z.object({
  preferences: preferencesClientSchema,
  revision: z.number().int().positive(),
  fingerprint: z.string().min(1),
});

export const profileDraftClientSchema = z.strictObject({
  displayName: z.string().max(80).nullable().optional(),
});

export const profileSnapshotSchema = z.object({
  displayName: z.string().max(80).nullable(),
  revision: z.number().int().positive(),
  dataScope: z.literal("shared_workspace"),
  stats: z
    .object({
      wardrobeItems: z.number().int().nonnegative().nullable(),
      savedLooks: z.number().int().nonnegative().nullable(),
      capsules: z.number().int().nonnegative().nullable(),
      activeShares: z.number().int().nonnegative().nullable(),
    })
    .optional(),
});

export type PreferencesSnapshot = z.infer<typeof preferencesSnapshotSchema>;
export type ProfileSnapshot = z.infer<typeof profileSnapshotSchema>;

const failureSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
  }),
});

export class SettingsApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "SettingsApiError";
  }
}

async function settingsRequestData<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init?.headers);
    if (init?.body) headers.set("Content-Type", "application/json");
    response = await fetch(path, {
      ...init,
      cache: "no-store",
      headers,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new SettingsApiError(
      "connection_failed",
      "Could not reach Stylora. Your draft is retained. Try again.",
      0,
      true,
    );
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = failureSchema.safeParse(body);
    throw new SettingsApiError(
      failure.success ? failure.data.error.code : "request_failed",
      failure.success
        ? failure.data.error.message
        : "The request could not finish. Try again.",
      response.status,
      failure.success ? failure.data.error.retryable : response.status >= 500,
    );
  }
  const envelope = z.object({ data: z.unknown() }).safeParse(body);
  const parsed = schema.safeParse(
    envelope.success ? envelope.data.data : undefined,
  );
  if (!parsed.success) {
    throw new SettingsApiError(
      "invalid_response",
      "Stylora returned an unexpected response. Your draft is retained. Try again.",
      502,
      true,
    );
  }
  return parsed.data;
}
export function settingsRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const notice = requestNotice(path, init?.method ?? "GET");
  const run = () => settingsRequestData(path, schema, init);
  return notice
    ? withFeedback(
        {
          id: `settings:${init?.method ?? "GET"}:${path}`,
          label: notice.label,
          success: notice.success,
          quiet: notice.quiet,
        },
        run,
      )
    : run();
}

export function readPreferences(signal?: AbortSignal) {
  return settingsRequest("/api/preferences", preferencesSnapshotSchema, {
    signal,
  });
}

export function savePreferences(
  preferences: z.input<typeof preferencesClientSchema>,
  expectedRevision: number,
) {
  const parsed = preferencesClientSchema.parse(preferences);
  const swatch = skinSwatchOptions.find(
    (option) => option.id === parsed.skinSwatchId,
  );
  if (
    ((parsed.skinSwatchId || parsed.skinSwatchHex) &&
      (!swatch || swatch.hex !== parsed.skinSwatchHex?.toUpperCase())) ||
    (parsed.bodyIllustrationId && !parsed.bodyIllustrationGroup)
  ) {
    throw new SettingsApiError(
      "invalid_preferences",
      "Choose a matching swatch and illustration set before saving.",
      400,
    );
  }
  return settingsRequest("/api/preferences", preferencesSnapshotSchema, {
    method: "PATCH",
    body: JSON.stringify({ preferences: parsed, expectedRevision }),
  });
}

export function readProfile(signal?: AbortSignal) {
  return settingsRequest("/api/profile", profileSnapshotSchema, { signal });
}

export function saveProfile(
  displayName: string | null,
  expectedRevision: number,
) {
  const name = displayName?.trim() || null;
  return settingsRequest("/api/profile", profileSnapshotSchema, {
    method: "PATCH",
    body: JSON.stringify({ displayName: name, expectedRevision }),
  });
}
