import { operationResponse } from "@/features/operations/http";
import { retryOperation } from "@/features/operations/control";
import { operationStatus } from "@/features/operations/schema";

export async function POST(
  _request: Request,
  context: { params: Promise<{ operationId: string }> },
) {
  return operationResponse(async () =>
    operationStatus(await retryOperation((await context.params).operationId)),
  );
}
