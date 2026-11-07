import { apiRoute } from "@/lib/api";
import { getLook } from "@/features/inspiration/server";

type Context = { params: Promise<{ lookId: string }> };

export async function GET(_request: Request, context: Context) {
  return apiRoute(async () => getLook((await context.params).lookId));
}
