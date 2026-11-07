import { NextResponse } from "next/server";
import { runSavedAvatar } from "@/features/outfits/saved-avatar";
import { operationStatus, OperationError } from "@/features/operations/server";

export const maxDuration = 300;

export async function POST(
  _request: Request,
  context: { params: Promise<{ operationId: string }> },
) {
  try {
    const { operationId } = await context.params;
    const operation = await runSavedAvatar(operationId);
    return NextResponse.json(
      { data: operationStatus(operation) },
      { headers: { "Cache-Control": "no-store" } },
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
