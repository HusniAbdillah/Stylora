import { dispatchOperation } from "@/features/operations/dispatch";
import { getOperation } from "@/features/operations/create";
import { operationStatus } from "@/features/operations/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ operationId: string }> },
) {
  const { operationId } = await context.params;
  return dispatchOperation(
    operationId,
    async (operation) => operationStatus(operation),
    () => getOperation(operationId),
  );
}
