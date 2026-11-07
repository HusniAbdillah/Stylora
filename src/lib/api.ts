import { ZodError } from "zod";
import { WorkspaceAccessError } from "@/lib/supabase/server";
import { StorageAssetError } from "@/lib/supabase/storage";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly retryable = false,
  ) {
    super(message);
  }
}

export async function apiRoute(run: () => Promise<unknown>) {
  try {
    return Response.json(
      { data: await run() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    let failure: ApiError;
    if (error instanceof ApiError) failure = error;
    else if (error instanceof ZodError || error instanceof SyntaxError) {
      failure = new ApiError(
        "invalid_request",
        "Check the submitted fields and try again.",
      );
    } else if (error instanceof WorkspaceAccessError) {
      const status =
        error.code === "WORKSPACE_RESOURCE_NOT_FOUND"
          ? 404
          : error.code === "WORKSPACE_WRITES_DISABLED"
            ? 403
            : 503;
      failure = new ApiError(error.code.toLowerCase(), error.message, status);
    } else if (error instanceof StorageAssetError) {
      failure = new ApiError(
        error.code.toLowerCase(),
        error.message,
        error.code.includes("INVALID") ? 400 : 502,
        error.retryable,
      );
    } else {
      failure = new ApiError(
        "operation_failed",
        "The operation could not finish. Try again.",
        500,
        true,
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
      { status: failure.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
