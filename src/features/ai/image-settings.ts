import { z } from "zod";

export const imageRenderSettingsSchema = z.strictObject({
  version: z.enum(["avatar-render.v2", "avatar-render.v3"]),
  model: z
    .string()
    .regex(
      /^gpt-image-(?:1\.5|1-mini|2(?:\.\d+)?(?:-[a-z]+)?)(?:-\d{4}-\d{2}-\d{2})?$/,
    )
    .optional(),
  quality: z.enum(["low", "medium", "high"]),
  size: z.literal("1024x1536"),
  format: z.literal("png"),
  inputFidelity: z.enum(["high", "low"]).nullable(),
});

export type ImageRenderSettings = z.infer<typeof imageRenderSettingsSchema>;

export function getImageRenderSettings(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ImageRenderSettings {
  const model = env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2.6-flare";
  return imageRenderSettingsSchema.parse({
    version: "avatar-render.v3",
    model,
    quality: env.OPENAI_IMAGE_QUALITY?.trim() || "medium",
    size: "1024x1536",
    format: "png",
    inputFidelity: /^gpt-image-1\.5(?:-|$)/.test(model)
      ? "high"
      : /^gpt-image-1-mini(?:-|$)/.test(model)
        ? "low"
        : null,
  });
}
