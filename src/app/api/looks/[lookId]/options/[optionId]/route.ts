import { apiResponse } from "@/lib/http";
import { getOutfitDetail } from "@/features/decisions/server";
import { optionParamsSchema } from "@/features/decisions/schemas";

export async function GET(
  _request: Request,
  context: { params: Promise<{ lookId: string; optionId: string }> },
) {
  return apiResponse(async () => {
    const params = optionParamsSchema.parse(await context.params);
    return getOutfitDetail(params.lookId, params.optionId);
  });
}
