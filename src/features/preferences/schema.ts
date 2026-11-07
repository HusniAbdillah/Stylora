import { createHash } from "node:crypto";
import { z } from "zod";
import { skinSwatchOptions } from "./preferences-types";

const nullableChoice = <const T extends readonly [string, ...string[]]>(
  values: T,
) => z.enum(values).nullable().optional();
const draftList = z.array(z.string().max(120)).max(16).optional();

export const preferencesDraftSchema = z.strictObject({
  skinSwatchId: nullableChoice([
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
  undertone: nullableChoice([
    "warm",
    "cool",
    "neutral",
    "olive",
    "unsure",
    "unknown",
  ]),
  contrast: nullableChoice(["soft", "medium", "strong", "unsure", "unknown"]),
  bodyIllustrationGroup: nullableChoice(["women", "men"]),
  bodyIllustrationId: nullableChoice([
    "hourglass",
    "pear",
    "round",
    "rectangle",
    "inverted_triangle",
  ]),
  fit: nullableChoice([
    "fitted",
    "regular",
    "relaxed",
    "oversized",
    "unsure",
    "unknown",
  ]),
  proportions: draftList,
  styles: draftList,
  colorFamilies: draftList,
  occasions: draftList,
  climate: draftList,
  coverage: draftList,
  lengths: draftList,
  layering: draftList,
  fabricDislikes: draftList,
  footwearComfort: draftList,
  careTolerance: draftList,
});

export const preferencesSchema = preferencesDraftSchema
  .transform((input) =>
    Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        Array.isArray(value)
          ? [
              ...new Set(
                value
                  .map((entry) => entry.trim().replace(/\s+/g, " "))
                  .filter(Boolean),
              ),
            ]
          : key === "skinSwatchHex" && typeof value === "string"
            ? value.toUpperCase()
            : value,
      ]),
    ),
  )
  .pipe(preferencesDraftSchema)
  .superRefine((input, context) => {
    const swatch = skinSwatchOptions.find(
      (option) => option.id === input.skinSwatchId,
    );
    if (
      (input.skinSwatchId || input.skinSwatchHex) &&
      (!swatch || swatch.hex !== input.skinSwatchHex)
    ) {
      context.addIssue({
        code: "custom",
        path: ["skinSwatchHex"],
        message: "Choose a matching skin swatch ID and hex value.",
      });
    }
    if (input.bodyIllustrationId && !input.bodyIllustrationGroup) {
      context.addIssue({
        code: "custom",
        path: ["bodyIllustrationGroup"],
        message:
          "Choose an illustration group for the selected body reference.",
      });
    }
  });

export const savePreferencesSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  preferences: preferencesSchema,
});

export type SavedPreferences = z.infer<typeof preferencesSchema>;
export type Personalization = Record<string, string | string[]>;

const unselected = new Set(["unsure", "unknown", "skip", "no preference"]);

export function normalizePreferences(input: SavedPreferences): Personalization {
  const parsed = preferencesSchema.parse(input);
  const normalized: Personalization = {};
  for (const key of Object.keys(parsed).sort() as Array<
    keyof SavedPreferences
  >) {
    const value = parsed[key];
    if (key === "bodyIllustrationGroup" && !parsed.bodyIllustrationId) continue;
    if (Array.isArray(value)) {
      const selected = value
        .filter((entry) => !unselected.has(entry.toLowerCase()))
        .sort();
      if (selected.length) normalized[key] = selected;
    } else if (
      typeof value === "string" &&
      !unselected.has(value.toLowerCase())
    ) {
      normalized[key] = value;
    }
  }
  if (parsed.skinSwatchId) normalized.skin_depth = parsed.skinSwatchId;
  return normalized;
}

export function preferencesFingerprint(input: SavedPreferences) {
  return createHash("sha256")
    .update(JSON.stringify(normalizePreferences(input)))
    .digest("hex");
}

export function preferencesToStorage(input: SavedPreferences) {
  const styleKeys = new Set([
    "skinSwatchId",
    "skinSwatchHex",
    "undertone",
    "contrast",
    "styles",
    "colorFamilies",
    "occasions",
    "climate",
  ]);
  const bodyKeys = new Set([
    "bodyIllustrationGroup",
    "bodyIllustrationId",
    "proportions",
  ]);
  const styleDna: Record<string, string | string[] | null> = {};
  const bodyProfile: Record<string, string | string[] | null> = {};
  const fitPreferences: Record<string, string | string[] | null> = {};
  for (const [key, value] of Object.entries(preferencesSchema.parse(input))) {
    if (value !== undefined)
      (styleKeys.has(key)
        ? styleDna
        : bodyKeys.has(key)
          ? bodyProfile
          : fitPreferences)[key] = value;
  }
  if (input.skinSwatchId) styleDna.skin_depth = input.skinSwatchId;
  return {
    style_dna: styleDna,
    body_profile: bodyProfile,
    fit_preferences: fitPreferences,
  };
}
