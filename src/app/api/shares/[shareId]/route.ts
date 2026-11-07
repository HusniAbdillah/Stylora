import { apiResponse } from "@/lib/http";
import { revokeShare } from "@/features/sharing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ shareId: string }> }) {
  return apiResponse(async () => revokeShare((await context.params).shareId));
}
