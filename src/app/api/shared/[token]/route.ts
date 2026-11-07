import { apiResponse } from "@/lib/http";
import { readPublicShare } from "@/features/sharing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  return apiResponse(async () => readPublicShare((await context.params).token));
}
