import { apiResponse, readJson } from "@/lib/http";
import { searchLookSlot } from "@/features/products/queries";

export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ lookId: string }> },
) {
  return apiResponse(async () => {
    const { lookId } = await context.params;
    return searchLookSlot(lookId, await readJson(request));
  });
}
