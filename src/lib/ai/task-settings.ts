import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import type { FashionTask } from "@/prompts/fashion";

export const fashionTaskSettingsSchema = z.strictObject({
  version: z.literal("fashion-request.v1"),
  model: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,119}$/),
  reasoningEffort: z.enum([
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
  ]),
  maxOutputTokens: z.number().int().min(256).max(128000),
});

export type FashionTaskSettings = z.infer<typeof fashionTaskSettingsSchema>;
type TextTask = Exclude<FashionTask, "preview_image"> | "wardrobe_description";
const groups: Record<TextTask, string> = {
  inspiration_description: "DESCRIPTION",
  wardrobe_description: "DESCRIPTION",
  inspiration_confidence: "CONFIDENCE",
  wardrobe_match: "MATCH",
  outfit_options: "OUTFIT",
  option_regeneration: "OUTFIT",
  capsule_generation: "CAPSULE",
};

export function getFashionTaskSettings(task: TextTask): FashionTaskSettings {
  const prefix = `OPENAI_${groups[task]}`;
  const result = fashionTaskSettingsSchema.safeParse({
    version: "fashion-request.v1",
    model:
      process.env[`${prefix}_MODEL`]?.trim() ||
      process.env.OPENAI_TEXT_MODEL?.trim() ||
      process.env.OPENAI_MODEL?.trim() ||
      "gpt-6-luna",
    reasoningEffort:
      process.env[`${prefix}_REASONING_EFFORT`]?.trim() ||
      process.env.OPENAI_TEXT_REASONING_EFFORT?.trim() ||
      "low",
    maxOutputTokens: Number(
      process.env[`${prefix}_MAX_OUTPUT_TOKENS`]?.trim() ||
        process.env.OPENAI_TEXT_MAX_OUTPUT_TOKENS?.trim() ||
        24000,
    ),
  });
  if (!result.success)
    throw new ApiError(
      "provider_unavailable",
      "The fashion task settings are invalid. Check the configured model and output controls.",
      503,
      false,
    );
  return result.data;
}
