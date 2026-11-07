import { apiResponse, readJson } from "@/lib/http";
import { saveLook } from "@/features/decisions/server";
import { lookParamsSchema } from "@/features/decisions/schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ lookId: string }> },
) {
  return apiResponse(async () => {
    const { lookId } = lookParamsSchema.parse(await context.params);
    return saveLook(lookId, await readJson(request));
  });
}
