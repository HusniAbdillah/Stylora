import "server-only";
import { ZodError } from "zod";
import { ApiError, apiResponse } from "@/lib/http";
import { OperationError } from "./errors";

export async function operationResponse(
  work: () => Promise<unknown>,
): Promise<Response> {
  let retryAfter: number | undefined;
  const response = await apiResponse(async () => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof OperationError) {
        retryAfter = error.retryAfterSeconds;
        throw new ApiError(
          error.code,
          error.message,
          error.status,
          error.retryable,
        );
      }
      if (error instanceof ZodError) {
        throw new ApiError(
          "OPERATION_RESPONSE_INVALID",
          "The operation status is unavailable. Reload to try again.",
          503,
        );
      }
      throw error;
    }
  });
  if (retryAfter !== undefined)
    response.headers.set("Retry-After", String(retryAfter));
  return response;
}
