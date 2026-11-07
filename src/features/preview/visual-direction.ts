import { z } from "zod";
import { attributesSchema, categorySchema } from "@/lib/ai/fashion-schema";
import {
  normalizePreferences,
  preferencesDraftSchema,
  preferencesSchema,
} from "@/features/preferences/schema";
import {
  menBodyIllustrations,
  skinSwatchOptions,
  womenBodyIllustrations,
} from "@/features/preferences/preferences-types";
import { previewSelectionSchema, slotForPreviewItem } from "./schema";

const selectedList = z
  .array(z.string().trim().min(1).max(120))
  .min(1)
  .max(16)
  .refine(
    (values) =>
      new Set(values).size === values.length &&
      values.every(
        (value) =>
          !["unsure", "unknown", "skip", "no preference"].includes(
            value.toLowerCase(),
          ),
      ),
    "Emit only effective supplied choices.",
  );
const bodyReferences = {
  women: womenBodyIllustrations,
  men: menBodyIllustrations,
};
const skinSchema = z
  .strictObject({
    swatchId: preferencesDraftSchema.shape.skinSwatchId
      .unwrap()
      .unwrap()
      .optional(),
    hex: z
      .string()
      .regex(/^#[A-F0-9]{6}$/)
      .optional(),
    depthLabel: z.string().min(1).max(40).optional(),
    undertone: z.enum(["warm", "cool", "neutral", "olive"]).optional(),
  })
  .superRefine((skin, context) => {
    if (!Object.values(skin).some((value) => value !== undefined))
      context.addIssue({
        code: "custom",
        message: "Skin direction must contain a supplied choice.",
      });
    if (skin.swatchId || skin.hex || skin.depthLabel) {
      const swatch = skinSwatchOptions.find(
        (entry) => entry.id === skin.swatchId,
      );
      if (
        !swatch ||
        swatch.hex !== skin.hex ||
        swatch.label !== skin.depthLabel
      )
        context.addIssue({
          code: "custom",
          message:
            "Skin swatch identity, hex and label must match the catalog.",
        });
    }
  });
const bodySchema = z
  .strictObject({
    group: z.enum(["women", "men"]).optional(),
    id: preferencesDraftSchema.shape.bodyIllustrationId
      .unwrap()
      .unwrap()
      .optional(),
    label: z.string().min(1).max(120).optional(),
    description: z.string().min(1).max(240).optional(),
    proportions: selectedList.optional(),
  })
  .superRefine((body, context) => {
    if (!Object.values(body).some((value) => value !== undefined))
      context.addIssue({
        code: "custom",
        message: "Body direction must contain a supplied choice.",
      });
    if (body.group || body.id || body.label || body.description) {
      const reference =
        body.group &&
        bodyReferences[body.group].find((entry) => entry.id === body.id);
      if (
        !reference ||
        reference.label !== body.label ||
        reference.description !== body.description
      )
        context.addIssue({
          code: "custom",
          message: "Body reference must match its chosen catalog group.",
        });
    }
  });
const visualPreferencesSchema = z.strictObject({
  skin: skinSchema.optional(),
  body: bodySchema.optional(),
  fit: z.enum(["fitted", "regular", "relaxed", "oversized"]).optional(),
  contrast: z.enum(["soft", "medium", "strong"]).optional(),
  styles: selectedList.optional(),
  colorFamilies: selectedList.optional(),
  occasions: selectedList.optional(),
  climate: selectedList.optional(),
  coverage: selectedList.optional(),
  lengths: selectedList.optional(),
  layering: selectedList.optional(),
  fabricDislikes: selectedList.optional(),
  footwearComfort: selectedList.optional(),
  careTolerance: selectedList.optional(),
  notes: z.string().trim().min(1).max(4000).optional(),
});
const visualKeys = [
  "skin",
  "body",
  "fit",
  "contrast",
  "styles",
  "colorFamilies",
  "coverage",
  "lengths",
  "layering",
] as const;
const hasVisualChoices = (
  preferences: z.infer<typeof visualPreferencesSchema>,
) => visualKeys.some((key) => preferences[key] !== undefined);
const slotSchema = previewSelectionSchema.keyof();
const slots = slotSchema.options;
type Slot = z.infer<typeof slotSchema>;
const compositionSchema = z
  .strictObject({
    selectedSlots: z.array(slotSchema).max(slots.length),
    omittedSlots: z.array(slotSchema).max(slots.length),
  })
  .refine((composition) => {
    const combined = [
      ...composition.selectedSlots,
      ...composition.omittedSlots,
    ];
    return (
      combined.length === slots.length &&
      new Set(combined).size === slots.length
    );
  }, "Selected and omitted slots must form a unique, disjoint, complete partition.");
const poseInstructions = {
  "standing-clear":
    "Relaxed balanced standing with a slight weight shift. Keep arms naturally apart from the torso and hands visible; show selected garment fronts, seams and hems without obstruction.",
  "three-quarter-outerwear":
    "Stand in a restrained three-quarter view with relaxed shoulders. Keep hands outside pockets and clear of the torso; show outerwear edges, fastenings and the selected layers without changing how they are worn.",
  "standing-dress":
    "Stand naturally with a restrained three-quarter turn and one foot slightly forward in a balanced stationary stance. Keep hands away from the waist and skirt; show the selected dress silhouette and hem.",
  "three-quarter-bag":
    "Stand in a gentle three-quarter view. Keep the selected bag fully visible in its referenced carrying position, slightly to the side where appropriate; keep hands and the bag clear of garment fronts and edges.",
  "standing-accessories":
    "Stand naturally with a slight three-quarter turn. Keep hands relaxed and visible beside the body so selected accessories, waist details and garment fronts remain readable without obstruction.",
} as const;
const bagInstruction =
  " Keep the selected bag visible in its referenced carrying position without covering the clothing.";
const accessoryInstruction =
  " Keep selected accessories visible and hands away from garment details.";
function poseForSlots(selectedSlots: readonly Slot[]) {
  const bag = selectedSlots.includes("bags");
  const accessories = bag || selectedSlots.includes("accessories");
  const id = selectedSlots.includes("outerwear")
    ? "three-quarter-outerwear"
    : selectedSlots.includes("dress")
      ? "standing-dress"
      : bag
        ? "three-quarter-bag"
        : accessories
          ? "standing-accessories"
          : "standing-clear";
  const bagNote = bag && id !== "three-quarter-bag" ? bagInstruction : "";
  const accessoryNote =
    accessories && id !== "standing-accessories" ? accessoryInstruction : "";
  const footwearNote = selectedSlots.includes("shoes")
    ? " Keep the selected footwear fully visible."
    : "";
  return {
    id,
    instructions: poseInstructions[id] + bagNote + accessoryNote + footwearNote,
  };
}

export const avatarVisualDirectionSchema = z
  .strictObject({
    version: z.literal("visual-direction.v2"),
    mode: z.enum(["neutral", "personalized"]),
    preferences: visualPreferencesSchema,
    composition: compositionSchema,
    pose: z.strictObject({
      id: z.enum([
        "standing-clear",
        "three-quarter-outerwear",
        "standing-dress",
        "three-quarter-bag",
        "standing-accessories",
      ]),
      instructions: z.string().min(1).max(1400),
    }),
  })
  .superRefine((direction, context) => {
    const expectedPose = poseForSlots(direction.composition.selectedSlots);
    if (
      direction.pose.id !== expectedPose.id ||
      direction.pose.instructions !== expectedPose.instructions
    )
      context.addIssue({
        code: "custom",
        path: ["pose", "instructions"],
        message:
          "Pose instructions must match the selected composition and versioned standing directions.",
      });
    if (
      (direction.mode === "personalized") !==
      hasVisualChoices(direction.preferences)
    )
      context.addIssue({
        code: "custom",
        path: ["mode"],
        message: "Personalization mode must reflect supplied visual choices.",
      });
  });
export type AvatarVisualDirection = z.infer<typeof avatarVisualDirectionSchema>;
export type AvatarVisualItem = {
  readonly category: string;
  readonly subcategory?: string | null;
  readonly attributes: unknown;
};

const record = z.record(z.string(), z.json());
const envelopeSchema = z.strictObject({
  revision: z.number().int().nonnegative().optional(),
  style_dna: record.optional(),
  body_profile: record.optional(),
  fit_preferences: record.optional(),
  style_notes: z.string().max(4000).optional(),
  styleDna: record.optional(),
  bodyProfile: record.optional(),
  fitPreferences: record.optional(),
  styleNotes: z.string().max(4000).optional(),
});
function invalid(path: string[], message: string): never {
  throw new z.ZodError([{ code: "custom", path, message }]);
}
function readPreferences(input: unknown) {
  const source = record.parse(input ?? {});
  let notes: string | undefined;
  let groups = [source];
  if (Object.keys(source).some((key) => key in envelopeSchema.shape)) {
    const envelope = envelopeSchema.parse(source);
    groups = [
      envelope.style_dna,
      envelope.body_profile,
      envelope.fit_preferences,
      envelope.styleDna,
      envelope.bodyProfile,
      envelope.fitPreferences,
    ].filter((value) => value !== undefined);
    if (
      envelope.style_notes !== undefined &&
      envelope.styleNotes !== undefined &&
      envelope.style_notes !== envelope.styleNotes
    )
      invalid(["style_notes"], "Conflicting saved notes require resolution.");
    notes = (envelope.style_notes ?? envelope.styleNotes)?.trim() || undefined;
  }
  const merged = new Map<string, unknown>();
  for (const group of groups)
    for (const [key, value] of Object.entries(group)) {
      if (
        merged.has(key) &&
        JSON.stringify(merged.get(key)) !== JSON.stringify(value)
      )
        invalid(
          [key],
          "Conflicting supplied preference values require resolution.",
        );
      merged.set(key, value);
    }
  const alias = merged.get("skin_depth");
  if (alias !== undefined && alias !== null) {
    if (merged.has("skinSwatchId") && merged.get("skinSwatchId") !== alias)
      invalid(
        ["skinSwatchId"],
        "Conflicting skin swatch identifiers require resolution.",
      );
    if (!merged.has("skinSwatchId")) merged.set("skinSwatchId", alias);
  }
  merged.delete("skin_depth");
  return {
    choices: normalizePreferences(
      preferencesSchema.parse(Object.fromEntries(merged)),
    ),
    notes,
  };
}

export function buildAvatarVisualDirection(
  preferences: unknown,
  items: readonly AvatarVisualItem[],
): AvatarVisualDirection {
  const { choices, notes } = readPreferences(preferences);
  const selected: Record<string, unknown> = {};
  const skin: Record<string, unknown> = {};
  if (choices.skinSwatchId) {
    const swatch = skinSwatchOptions.find(
      (entry) => entry.id === choices.skinSwatchId,
    );
    if (!swatch) invalid(["skinSwatchId"], "Unknown skin swatch.");
    Object.assign(skin, {
      swatchId: swatch.id,
      hex: swatch.hex,
      depthLabel: swatch.label,
    });
  }
  if (choices.undertone) skin.undertone = choices.undertone;
  if (Object.keys(skin).length) selected.skin = skin;
  const body: Record<string, unknown> = {};
  if (choices.bodyIllustrationGroup && choices.bodyIllustrationId) {
    const group = z.enum(["women", "men"]).parse(choices.bodyIllustrationGroup);
    const reference = bodyReferences[group].find(
      (entry) => entry.id === choices.bodyIllustrationId,
    );
    if (!reference) invalid(["bodyIllustrationId"], "Unknown body reference.");
    Object.assign(body, {
      group,
      id: reference.id,
      label: reference.label,
      description: reference.description,
    });
  }
  if (choices.proportions) body.proportions = choices.proportions;
  if (Object.keys(body).length) selected.body = body;
  for (const [key, value] of Object.entries(choices)) {
    if (
      ![
        "skinSwatchId",
        "skinSwatchHex",
        "skin_depth",
        "undertone",
        "bodyIllustrationGroup",
        "bodyIllustrationId",
        "proportions",
      ].includes(key)
    )
      selected[key] = value;
  }
  if (notes) selected.notes = notes;
  const validated = visualPreferencesSchema.parse(selected);
  const outfit = z
    .array(
      z.object({
        category: categorySchema,
        subcategory: z.string().max(120).nullable().optional(),
        attributes: attributesSchema,
      }),
    )
    .max(20)
    .parse(items);
  const suppliedSlots = new Set(
    outfit.map((item) =>
      slotSchema.parse(
        slotForPreviewItem({
          category: item.category,
          subcategory: item.subcategory ?? null,
        }),
      ),
    ),
  );
  const composition = {
    selectedSlots: slots.filter((slot) => suppliedSlots.has(slot)),
    omittedSlots: slots.filter((slot) => !suppliedSlots.has(slot)),
  };
  return avatarVisualDirectionSchema.parse({
    version: "visual-direction.v2",
    mode: hasVisualChoices(validated) ? "personalized" : "neutral",
    preferences: validated,
    composition,
    pose: poseForSlots(composition.selectedSlots),
  });
}
