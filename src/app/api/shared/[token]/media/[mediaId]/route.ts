import { apiResponse } from "@/lib/http";
import { readPublicAvatar } from "@/features/sharing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ token: string; mediaId: string }> }) {
  return apiResponse(async () => {
    const { token, mediaId } = await context.params;
    return readPublicAvatar(token, mediaId);
  });
}
