import { ApiError, apiRoute } from "@/lib/api";
import { OperationError } from "@/features/operations/errors";
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
  return previewResponse(async () =>
    generatePreviewImage(await request.json()),
  );
}

export async function GET(request: Request) {
  return previewResponse(async () =>
    previewImageStatus(new URL(request.url).searchParams.get("draftId") ?? ""),
  );
}
