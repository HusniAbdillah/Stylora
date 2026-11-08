import { NextResponse } from "next/server";
import { runSavedAvatar } from "@/features/outfits/saved-avatar";
import {
  operationStatus,
  OperationError,
  readOperation,
} from "@/features/operations/server";
import {
  executorResponse,
  usesWorkflowWorker,
} from "@/features/operations/execution-mode";

export const maxDuration = 300;

export async function POST(
  _request: Request,
  context: { params: Promise<{ operationId: string }> },
) {
  try {
    const { operationId } = await context.params;
    const operation = usesWorkflowWorker()
      ? await readOperation(operationId)
      : await runSavedAvatar(operationId);
    if (operation.kind !== "saved_avatar")
      throw new OperationError(
        "AVATAR_OPERATION_NOT_FOUND",
        "This image is unavailable.",
        404,
      );
    return executorResponse(
      NextResponse.json(
        { data: operationStatus(operation) },
        { headers: { "Cache-Control": "no-store" } },
      ),
    );
  } catch (error) {
    const failure =
      error instanceof OperationError
        ? error
        : new OperationError(
            "SAVED_AVATAR_UNAVAILABLE",
            "The saved image could not start. Try again.",
            503,
          );
    return NextResponse.json(
      {
        error: {
          code: failure.code,
          message: failure.message,
          retryable: failure.retryable,
        },
      },
      { status: failure.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
