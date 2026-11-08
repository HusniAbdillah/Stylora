import { apiRoute } from "@/lib/api";
import { startDraftOperation } from "@/features/operations/create";
import {
  executorResponse,
  usesBackgroundExecution,
} from "@/features/operations/execution-mode";
export const maxDuration = 300;
export async function POST(
  request: Request,
  context: { params: Promise<{ draftId: string }> },
) {
  return executorResponse(
    await apiRoute(async () => {
      const body: unknown = await request.json();
      return startDraftOperation(
        (await context.params).draftId,
        usesBackgroundExecution() &&
          body &&
          typeof body === "object" &&
          !Array.isArray(body)
          ? { ...body, execute: false }
          : body,
      );
    }),
  );
}
