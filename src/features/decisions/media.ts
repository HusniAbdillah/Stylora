import { z } from "zod";
import { canRetryOperationCode } from "@/features/operations/errors";

export type SavedMediaState = {
  id: string | null;
  status:
    | "unavailable"
    | "queued"
    | "running"
    | "failed"
    | "succeeded"
    | "cancelled"
    | "superseded";
  assetId: string | null;
  imageUrl: string | null;
  operationId: string | null;
  canRetry: boolean;
  readyMediaId: string | null;
};

export function savedMediaState(
  media: {
    id: string;
    status: string;
    output_asset_id: string | null;
    operation_id: string;
  } | null,
  operation: {
    status: string;
    attempt_count: number;
    safe_error_code?: string | null;
    cancel_requested_at?: string | null;
    retryable?: boolean;
  } | null,
  readyPreview: boolean,
  imageUrl: string | null,
  writesEnabled: boolean,
  previousReady?: { id: string; assetId: string; imageUrl: string | null },
): SavedMediaState {
  if (
    !media ||
    !operation ||
    !["queued", "running", "failed", "succeeded"].includes(media.status)
  ) {
    return {
      id: null,
      status: "unavailable",
      assetId: null,
      imageUrl: null,
      operationId: null,
      canRetry: false,
      readyMediaId: null,
    };
  }
  const succeeded = media.status === "succeeded" && readyPreview;
  return {
    id: media.id,
    status: ["cancelled", "superseded"].includes(operation.status)
      ? (operation.status as "cancelled" | "superseded")
      : (media.status as Exclude<SavedMediaState["status"], "unavailable">),
    assetId: succeeded
      ? media.output_asset_id
      : (previousReady?.assetId ?? null),
    imageUrl: succeeded ? imageUrl : (previousReady?.imageUrl ?? null),
    readyMediaId: succeeded ? media.id : (previousReady?.id ?? null),
    operationId: media.operation_id,
    canRetry:
      writesEnabled &&
      media.status === "failed" &&
      operation.status === "failed" &&
      operation.attempt_count < 3 &&
      operation.cancel_requested_at == null &&
      operation.retryable !== false &&
      canRetryOperationCode(operation.safe_error_code ?? ""),
  };
}
export const regenerateMediaSchema = z.strictObject({
  expectedMediaId: z.uuid(),
  idempotencyKey: z.uuid(),
});

export const mediaCommandSchema = z.object({
  savedLookId: z.uuid(),
  media: z.object({ operationId: z.uuid() }),
});
