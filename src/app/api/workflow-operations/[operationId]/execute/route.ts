import { apiRoute } from "@/lib/api";
import { executeOperation } from "@/features/operations/create";
import {
  executorResponse,
  usesWorkflowWorker,
} from "@/features/operations/execution-mode";
import { getOperation } from "@/features/operations/create";
export const maxDuration = 300;
export async function POST(
  _request: Request,
  context: { params: Promise<{ operationId: string }> },
) {
  return executorResponse(
    await apiRoute(async () => {
      const { operationId } = await context.params;
      return usesWorkflowWorker()
        ? getOperation(operationId)
        : executeOperation(operationId);
    }),
  );
}
