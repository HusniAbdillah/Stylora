export type SavedMediaState = {
  status: "unavailable" | "queued" | "running" | "failed" | "succeeded";
  assetId: string | null;
  imageUrl: string | null;
  operationId: string | null;
  canRetry: boolean;
};

export function savedMediaState(
  media: {
    status: string;
    output_asset_id: string | null;
    operation_id: string;
  } | null,
  operation: { status: string; attempt_count: number } | null,
  readyPreview: boolean,
  imageUrl: string | null,
  writesEnabled: boolean,
): SavedMediaState {
  if (
    !media ||
    !operation ||
    !["queued", "running", "failed", "succeeded"].includes(media.status)
  ) {
    return {
      status: "unavailable",
      assetId: null,
      imageUrl: null,
      operationId: null,
      canRetry: false,
    };
  }
  const succeeded = media.status === "succeeded" && readyPreview;
  return {
    status: media.status as Exclude<SavedMediaState["status"], "unavailable">,
    assetId: succeeded ? media.output_asset_id : null,
    imageUrl: succeeded ? imageUrl : null,
    operationId: media.operation_id,
    canRetry:
      writesEnabled &&
      media.status === "failed" &&
      operation.status === "failed" &&
      operation.attempt_count < 3,
  };
}
