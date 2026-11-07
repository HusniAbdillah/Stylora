import { apiRoute } from "@/lib/api";
import { startDraftOperation } from "@/features/operations/server";
export const maxDuration = 300;
export async function POST(
  request: Request,
  context: { params: Promise<{ draftId: string }> },
) {
  return apiRoute(async () =>
    startDraftOperation((await context.params).draftId, await request.json()),
  );
}
