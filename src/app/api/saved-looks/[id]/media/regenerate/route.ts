import { apiResponse, readJson } from "@/lib/http";
import { regenerateSavedMedia } from "@/features/decisions/server";
import { savedParamsSchema } from "@/features/decisions/schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return apiResponse(async () => {
    const { id } = savedParamsSchema.parse(await context.params);
    return regenerateSavedMedia(id, await readJson(request));
  });
}
