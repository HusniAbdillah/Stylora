import { apiResponse, readJson } from "@/lib/http";
import { importProductCandidate } from "@/features/products/image-import";

export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ productId: string }> },
) {
  return apiResponse(async () => {
    const { productId } = await context.params;
    return importProductCandidate(productId, await readJson(request));
  });
}
