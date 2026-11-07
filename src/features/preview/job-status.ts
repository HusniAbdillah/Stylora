import { z } from "zod";
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
export function isCurrentPreviewContext(
  operation: { input: unknown; prompt_version: string; model: string },
  current: { renderFingerprint: string; promptVersion: string; model: string },
) {
  const input = z
    .object({ renderFingerprint: z.string() })
    .safeParse(operation.input);
  return (
    input.success &&
    input.data.renderFingerprint === current.renderFingerprint &&
    operation.prompt_version === current.promptVersion &&
    operation.model === current.model
  );
}
