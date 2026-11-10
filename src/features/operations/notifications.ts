"use client";

import { z } from "zod";
import { operationKindSchema, operationStatusSchema } from "./schema";
import { publishFeedback, type FeedbackState } from "@/lib/feedback/store";
import { retryOperationRequest } from "./client";

const rowSchema = z.object({
  id: z.uuid(),
  kind: operationKindSchema,
  status: operationStatusSchema,
  subjectType: z.string(),
  subjectId: z.uuid(),
  safeErrorCode: z.string().nullable().optional(),
  retryable: z.boolean().optional(),
  updatedAt: z.iso.datetime({ offset: true }),
});
type Row = z.infer<typeof rowSchema>;
const labels: Record<Row["kind"], string> = {
  inspiration_description: "Pieces described",
  inspiration_confidence: "Review with confidence",
  wardrobe_match: "Wardrobe matching",
  outfit_options: "Outfit ideas",
  option_regeneration: "Another outfit idea",
  marketplace_search: "Shopping search",
  wardrobe_description: "Wardrobe description",
  capsule_generation: "Capsule outfits",
  preview_image: "Preview image",
  saved_avatar: "Saved avatar image",
};
const details: Record<FeedbackState, string> = {
  queued: "Queued. Waiting to start.",
  running: "In progress. You can keep browsing.",
  partial: "Partial results are available. Final validation is still pending.",
  complete: "Ready to view.",
  failed: "Could not finish. Open the task to review the error and retry.",
  cancelled: "Cancelled. No completed result is claimed.",
  superseded:
    "Inputs changed. This result has been replaced by a newer revision.",
};
const seen = new Map<string, { status: Row["status"]; updatedAt: string }>();
let initialized = false;
function destination(row: Row) {
  if (row.kind === "wardrobe_description") return "/wardrobe";
  if (row.kind === "preview_image") return `/preview?draftId=${row.subjectId}`;
  if (row.kind === "saved_avatar") return `/saved-looks/${row.subjectId}`;
  if (row.kind === "capsule_generation") return `/capsules/${row.subjectId}`;
  if (row.subjectType === "look") {
    const step =
      row.kind === "wardrobe_match"
        ? "matches"
        : ["outfit_options", "option_regeneration"].includes(row.kind)
          ? "ideas"
          : "review";
    return `/create/${row.subjectId}?step=${step}`;
  }
}
const retrying = new Set<string>();
async function retry(row: Row) {
  if (retrying.has(row.id)) return;
  retrying.add(row.id);
  try {
    const current = await fetch(`/api/workflow-operations/${row.id}`, {
      cache: "no-store",
    });
    const allowed = z
      .object({
        data: z.object({
          status: z.literal("failed"),
          resultRef: z.object({ retryable: z.literal(true) }),
        }),
      })
      .safeParse(await current.json());
    if (!current.ok || !allowed.success) throw new Error("review_required");
    const url =
      row.kind === "capsule_generation"
        ? `/api/capsules/${row.subjectId}/generate`
        : `/api/avatars/${row.id}`;
    const response = await retryOperationRequest(row.id, url, {});
    if (!response.ok) throw new Error("retry_unavailable");
  } catch {
    publishFeedback({
      id: `retry:${row.id}`,
      label: "Retry needs review",
      state: "failed",
      detail: "Open the task to check its current state and retry options.",
      href: destination(row),
    });
  } finally {
    retrying.delete(row.id);
  }
}
export function acceptOperationActivity(input: unknown, writesEnabled = false) {
  const rows = z.array(rowSchema).parse(input);
  for (const row of rows) {
    const previous = seen.get(row.id);
    if (previous && Date.parse(row.updatedAt) < Date.parse(previous.updatedAt))
      continue;
    if (previous?.status === row.status && previous.updatedAt === row.updatedAt)
      continue;
    seen.set(row.id, { status: row.status, updatedAt: row.updatedAt });
    const state = row.status === "succeeded" ? "complete" : row.status;
    const changed = previous ? previous.status !== row.status : initialized;
    publishFeedback({
      id: `operation:${row.id}`,
      label: labels[row.kind],
      state,
      detail:
        state === "queued" &&
        row.safeErrorCode?.toUpperCase() === "PROVIDER_DAILY_BUDGET_EXHAUSTED"
          ? "Waiting for the daily AI limit to reset at 00:00 UTC. Your draft is saved."
          : details[state],
      href: destination(row),
      onRetry:
        writesEnabled &&
        state === "failed" &&
        row.retryable === true &&
        ["capsule_generation", "saved_avatar"].includes(row.kind)
          ? () => void retry(row)
          : undefined,
      toast: changed && ["complete", "failed"].includes(state),
    });
  }
  initialized = true;
  if (seen.size > 300) {
    const retained = new Set(rows.map((row) => row.id));
    for (const id of seen.keys()) if (!retained.has(id)) seen.delete(id);
  }
}
