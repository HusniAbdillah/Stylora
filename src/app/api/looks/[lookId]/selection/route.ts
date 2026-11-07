import { apiResponse, readJson } from "@/lib/http";
import { saveSelection } from "@/features/decisions/server";
import { lookParamsSchema } from "@/features/decisions/schemas";

export async function PUT(
  request: Request,
  context: { params: Promise<{ lookId: string }> },
) {
  return apiResponse(async () => {
    const { lookId } = lookParamsSchema.parse(await context.params);
    return saveSelection(lookId, await readJson(request));
  });
}
