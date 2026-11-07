import { apiRoute } from "@/lib/api";
import { getOperation } from "@/features/operations/server";
export async function GET(
  _request: Request,
  context: { params: Promise<{ operationId: string }> },
) {
  return apiRoute(async () => getOperation((await context.params).operationId));
}
