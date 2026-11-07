import { z } from "zod";

export const imageRenderSettingsSchema = z.strictObject({
  version: z.literal("avatar-render.v2"),
  quality: z.enum(["low", "medium", "high"]),
  size: z.literal("1024x1536"),
  format: z.literal("png"),
  inputFidelity: z.literal("high"),
});

export type ImageRenderSettings = z.infer<typeof imageRenderSettingsSchema>;

export function getImageRenderSettings(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ImageRenderSettings {
  return imageRenderSettingsSchema.parse({
    version: "avatar-render.v2",
    quality: env.OPENAI_IMAGE_QUALITY?.trim() || "medium",
    size: "1024x1536",
    format: "png",
    inputFidelity: "high",
  });
}
