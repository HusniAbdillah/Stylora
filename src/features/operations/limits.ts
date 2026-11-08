import { z } from "zod";

export function workflowProviderLimits(env: Readonly<Record<string, string | undefined>> = process.env) {
  return z.object({
    textDailyLimit: z.coerce.number().int().min(1).max(10000),
    imageDailyLimit: z.coerce.number().int().min(1).max(1000),
  }).parse({
    textDailyLimit: env.STYLORA_TEXT_DAILY_LIMIT ?? 150,
    imageDailyLimit: env.STYLORA_IMAGE_DAILY_LIMIT ?? 20,
  });
}
