import { ApiError, apiRoute } from "@/lib/api";
import { OperationError } from "@/features/operations/errors";
import {
  executorResponse,
  usesWorkflowWorker,
} from "@/features/operations/execution-mode";
import { previewPollStatus } from "@/features/preview/poll-status";
import {
  generatePreviewImage,
  previewImageStatus,
} from "@/features/preview/generation";

export const maxDuration = 300;
export const runtime = "nodejs";

function previewResponse(run: () => Promise<unknown>) {
  return apiRoute(async () => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof OperationError)
        throw new ApiError(
          error.code,
          error.message,
          error.status,
          error.retryable,
        );
      throw error;
    }
  });
}

export async function POST(request: Request) {
  return executorResponse(
    await previewResponse(async () =>
      generatePreviewImage(await request.json(), {
        execute: !usesWorkflowWorker(),
      }),
    ),
  );
}

export async function GET(request: Request) {
  return previewResponse(async () => {
    const query = new URL(request.url).searchParams;
    const draftId = query.get("draftId") ?? "";
    return query.get("poll") === "1"
      ? previewPollStatus(draftId)
      : previewImageStatus(draftId);
  });
}
