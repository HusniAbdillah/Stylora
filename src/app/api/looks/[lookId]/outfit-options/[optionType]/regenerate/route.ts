import { z } from "zod";
import { ApiError, apiRoute } from "@/lib/api";
import { getLookContext } from "@/features/inspiration/server";
import { startLookOperation } from "@/features/operations/create";
import { optionTypeSchema } from "@/features/outfits/schema";
export const maxDuration = 300;
export async function POST(
  request: Request,
  context: { params: Promise<{ lookId: string; optionType: string }> },
) {
  return apiRoute(async () => {
    const { lookId, optionType } = await context.params;
    const input = z
      .strictObject({
        expectedRevision: z.number().int().positive(),
        expectedOptionId: z.uuid(),
        execute: z.boolean().default(true),
        inventoryMode: z.enum(["sample", "live"]).default("live"),
        intentId: z.uuid().optional(),
      })
      .parse(await request.json());
    if ((await getLookContext(lookId)).look.revision !== input.expectedRevision)
      throw new ApiError(
        "revision_conflict",
        "The inspiration changed. Reload before regenerating.",
        409,
      );
    return startLookOperation(
      lookId,
      {
        kind: "option_regeneration",
        inventoryMode: input.inventoryMode,
        execute: input.execute,
        intentId: input.intentId,
      },
      optionTypeSchema.parse(optionType),
      input.expectedOptionId,
    );
  });
}
