import "server-only";
import { ZodError } from "zod";
import { WorkspaceAccessError } from "./supabase/server";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiResponse<T>(operation: () => Promise<T>) {
  try {
    const data = await operation();
    if (data instanceof Response) {
      data.headers.set("Cache-Control", "private, no-store");
      return data;
    }
    return Response.json(
      { data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    let failure: ApiError;
    if (error instanceof ApiError) failure = error;
    else if (error instanceof ZodError) {
      failure = new ApiError(
        "INVALID_INPUT",
        "Check the supplied fields and try again.",
      );
    } else if (error instanceof WorkspaceAccessError) {
      const status =
        error.code === "WORKSPACE_WRITES_DISABLED"
          ? 403
          : error.code === "WORKSPACE_RESOURCE_NOT_FOUND"
            ? 404
            : 503;
      failure = new ApiError(error.code, error.message, status);
    } else {
      failure = new ApiError(
        "REQUEST_FAILED",
        "The request could not be completed. Try again.",
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

export async function readJson(request: Request): Promise<unknown> {
  const limit = 64 * 1024;
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  ) {
    throw new ApiError("JSON_REQUIRED", "Send the request as JSON.", 415);
  }
  if (Number(request.headers.get("content-length")) > limit) {
    throw new ApiError("BODY_TOO_LARGE", "The request is too large.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader)
    throw new ApiError("INVALID_JSON", "Provide a JSON request body.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new ApiError("BODY_TOO_LARGE", "The request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError("INVALID_JSON", "Provide a valid JSON request body.");
  }
}
