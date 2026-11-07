import { apiResponse } from "@/lib/http";
import { listLookProducts } from "@/features/products/queries";

export async function GET(
  request: Request,
  context: { params: Promise<{ lookId: string }> },
) {
  return apiResponse(async () => {
    const { lookId } = await context.params;
    return listLookProducts(
      lookId,
      new URL(request.url).searchParams.get("optionId") ?? "",
    );
  });
}
