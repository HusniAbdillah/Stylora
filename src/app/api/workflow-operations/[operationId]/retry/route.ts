import { dispatchOperation } from "@/features/operations/dispatch";
import { controlOperation } from "@/features/operations/create";
import { retryOperation } from "@/features/operations/control";
import { operationStatus } from "@/features/operations/schema";

export const maxDuration = 300;
export async function POST(_request: Request, context: { params: Promise<{ operationId: string }> }) {
  const { operationId } = await context.params;
  return dispatchOperation(operationId, async (operation) => operationStatus(await retryOperation(operation.id)), () => controlOperation(operationId, "retry"));
}
