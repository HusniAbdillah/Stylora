import type { PreviewJob } from "./preview-studio";

const statuses = new Map<string, PreviewJob["status"]>([
  ["queued", "queued"],
  ["running", "running"],
  ["partial", "running"],
  ["succeeded", "succeeded"],
  ["failed", "failed"],
  ["cancelled", "cancelled"],
  ["superseded", "idle"],
]);

export function previewJobStatus(status: string): PreviewJob["status"] {
  return statuses.get(status) ?? "failed";
}
