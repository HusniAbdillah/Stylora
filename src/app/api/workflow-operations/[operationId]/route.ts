import { operationResponse } from "@/features/operations/http";
import { operationStatus, readOperation } from "@/features/operations/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ operationId: string }> },
) {
  return operationResponse(async () =>
    operationStatus(await readOperation((await context.params).operationId)),
  );
}
