import { z } from "zod";
import { OperationError } from "@/features/operations/errors";

const upstreamStatus = z.number().int().min(0).max(599).optional();
const failureSchema = z.object({
  name: z.string().optional(),
  code: z.string().optional(),
  status: upstreamStatus,
  statusCode: z
    .string()
    .regex(/^\d{3}$/)
    .optional(),
  upstreamStatus,
  retryable: z.boolean().optional(),
  originalError: z.unknown().optional(),
});
const storageCode = z.enum([
  "INVALID_STORAGE_UPLOAD",
  "INVALID_STORAGE_ASSET",
  "STORAGE_ASSET_CREATE_FAILED",
  "STORAGE_ASSET_READ_FAILED",
  "STORAGE_SIGN_FAILED",
  "STORAGE_DOWNLOAD_FAILED",
  "STORAGE_IMAGE_INVALID",
]);

export function avatarIoError(
  failure: unknown,
  fallback: string,
  responseStatus?: number,
): OperationError {
  if (failure instanceof OperationError) return failure;
  const parsed = failureSchema.safeParse(failure);
  const metadata = parsed.success ? parsed.data : {};
  const knownCode = storageCode.safeParse(metadata.code);
  const terminal =
    [
      "INVALID_STORAGE_UPLOAD",
      "INVALID_STORAGE_ASSET",
      "STORAGE_IMAGE_INVALID",
      "42501",
      "28000",
      "28P01",
    ].includes(metadata.code ?? "") || metadata.retryable === false;
  const status =
    metadata.upstreamStatus ??
    responseStatus ??
    metadata.status ??
    (metadata.statusCode ? Number(metadata.statusCode) : undefined);
  let retryCode: string | undefined;
  if (!terminal) {
    if (status === 0) retryCode = "PROVIDER_NETWORK_ERROR";
    else if (status === 408) retryCode = "PROVIDER_TIMEOUT";
    else if (status === 429) retryCode = "PROVIDER_RATE_LIMITED";
    else if ([500, 502, 503, 504].includes(status ?? -1))
      retryCode = "PROVIDER_SERVER_ERROR";
    else if (status === undefined) {
      if (metadata.retryable === true) retryCode = "PROVIDER_NETWORK_ERROR";
      else if (metadata.name === "StorageUnknownError") {
        if (metadata.originalError instanceof TypeError)
          retryCode = "PROVIDER_NETWORK_ERROR";
        else if (
          metadata.originalError instanceof Error &&
          ["AbortError", "TimeoutError"].includes(metadata.originalError.name)
        )
          retryCode = "PROVIDER_TIMEOUT";
      }
    }
  }
  return new OperationError(
    retryCode ?? (knownCode.success ? knownCode.data : fallback),
    "The image could not be loaded or stored.",
    503,
    retryCode !== undefined,
  );
}
