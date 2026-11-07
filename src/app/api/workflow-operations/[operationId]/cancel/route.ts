import { dispatchOperation } from "@/features/operations/dispatch";
import { controlOperation } from "@/features/operations/create";
import { cancelOperation } from "@/features/operations/control";
import { operationStatus } from "@/features/operations/schema";

export async function POST(_request: Request, context: { params: Promise<{ operationId: string }> }) {
  const { operationId } = await context.params;
  return dispatchOperation(operationId, async (operation) => operationStatus(await cancelOperation(operation.id)), () => controlOperation(operationId, "cancel"));
}
