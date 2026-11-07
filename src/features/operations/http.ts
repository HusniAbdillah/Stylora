import "server-only";
import { WorkspaceAccessError } from "@/lib/supabase/server";
import { OperationError } from "./errors";

export async function operationResponse(
  work: () => Promise<unknown>,
): Promise<Response> {
  try {
    return Response.json(
      { data: await work() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const failure =
      error instanceof OperationError
        ? error
        : new OperationError(
            "OPERATION_UNAVAILABLE",
            "This operation is unavailable. Reload to try again.",
            503,
            true,
          );
    if (error instanceof WorkspaceAccessError) {
      return Response.json(
        {
          error: { code: error.code, message: error.message, retryable: false },
        },
        {
          status: error.code === "WORKSPACE_WRITES_DISABLED" ? 403 : 503,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
    return Response.json(
      {
        error: {
          code: failure.code,
          message: failure.message,
          retryable: failure.retryable,
        },
      },
      {
        status: failure.status,
        headers: {
          "Cache-Control": "no-store",
          ...(failure.retryAfterSeconds === undefined
            ? {}
            : { "Retry-After": String(failure.retryAfterSeconds) }),
        },
      },
    );
  }
}
