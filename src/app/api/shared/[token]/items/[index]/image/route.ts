import { apiResponse } from "@/lib/http";
import { readPublicItemImage } from "@/features/sharing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ token: string; index: string }> }) {
  return apiResponse(async () => {
    const { token, index } = await context.params;
    return readPublicItemImage(token, index);
  });
}
