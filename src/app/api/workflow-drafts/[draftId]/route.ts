import { apiRoute } from "@/lib/api";
import { getDraft, updateDraft } from "@/features/operations/drafts";

type RouteContext = { params: Promise<{ draftId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  return apiRoute(async () => getDraft((await context.params).draftId));
}

export async function PATCH(request: Request, context: RouteContext) {
  return apiRoute(async () =>
    updateDraft((await context.params).draftId, await request.json()),
  );
}
