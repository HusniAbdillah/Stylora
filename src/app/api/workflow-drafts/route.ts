import { apiRoute } from "@/lib/api";
import { createDraft } from "@/features/operations/drafts";

export async function POST(request: Request) {
  return apiRoute(async () => createDraft(await request.json()));
}
