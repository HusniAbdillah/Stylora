import { operationResponse } from "@/features/operations/http";
import { cancelOperation } from "@/features/operations/control";
import { operationStatus } from "@/features/operations/schema";

export async function POST(
  _request: Request,
  context: { params: Promise<{ operationId: string }> },
) {
  return operationResponse(async () =>
    operationStatus(await cancelOperation((await context.params).operationId)),
  );
}
