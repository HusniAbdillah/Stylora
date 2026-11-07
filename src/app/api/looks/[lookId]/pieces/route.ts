import { apiRoute } from "@/lib/api";
import { savePieces } from "@/features/inspiration/server";

type Context = { params: Promise<{ lookId: string }> };

export async function PATCH(request: Request, context: Context) {
  return apiRoute(async () =>
    savePieces((await context.params).lookId, await request.json()),
  );
}
