import { apiResponse, readJson } from "@/lib/http";
import { retrySavedMedia } from "@/features/decisions/server";
import {
  emptyBodySchema,
  savedParamsSchema,
} from "@/features/decisions/schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return apiResponse(async () => {
    const { id } = savedParamsSchema.parse(await context.params);
    emptyBodySchema.parse(request.body ? await readJson(request) : {});
    return retrySavedMedia(id);
  });
}
