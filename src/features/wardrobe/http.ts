import "server-only";
import { ApiError, apiRoute } from "@/lib/api";
import { ApiError as BodyError, readJson } from "@/lib/http";
import { OperationError } from "@/features/operations/server";
export async function wardrobeRoute(run: () => Promise<unknown>) {
  return apiRoute(async () => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof BodyError || error instanceof OperationError)
        throw new ApiError(
          error.code.toLowerCase(),
          error.message,
          error.status,
          error.retryable,
        );
      throw error;
    }
  });
}
export { readJson };
