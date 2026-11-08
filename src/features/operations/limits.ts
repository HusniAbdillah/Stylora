import { z } from "zod";

export function workflowDailyBudgetReset(now = Date.now()) {
  const date = new Date(now);
  const reset = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
  );
  return {
    retryAfter: new Date(reset).toISOString(),
    retryAfterSeconds: Math.ceil((reset - now) / 1000),
  };
}

export function workflowProviderLimits(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return z
    .object({
      textDailyLimit: z.coerce.number().int().min(1).max(10000),
      imageDailyLimit: z.coerce.number().int().min(1).max(1000),
    })
    .parse({
      textDailyLimit: env.STYLORA_TEXT_DAILY_LIMIT ?? 150,
      imageDailyLimit: env.STYLORA_IMAGE_DAILY_LIMIT ?? 20,
    });
}
