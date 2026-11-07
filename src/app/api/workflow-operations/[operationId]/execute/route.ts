import { apiRoute } from "@/lib/api";
import { executeOperation } from "@/features/operations/create";
export const maxDuration = 300;
export async function POST(
  _request: Request,
  context: { params: Promise<{ operationId: string }> },
) {
  return apiRoute(async () =>
    executeOperation((await context.params).operationId),
  );
}
