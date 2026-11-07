import { apiResponse, readJson } from "@/lib/http";
import { attachProductCandidate } from "@/features/products/queries";

export async function POST(
  request: Request,
  context: { params: Promise<{ lookId: string }> },
) {
  return apiResponse(async () => {
    const { lookId } = await context.params;
    return attachProductCandidate(lookId, await readJson(request));
  });
}
