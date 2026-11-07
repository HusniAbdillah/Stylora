"use client";

import { z } from "zod";
import { publishFeedback } from "./store";

type Notice = { label: string; success: string; quiet?: boolean };
const errorSchema = z.object({
  error: z.object({ message: z.string().min(1).max(600) }),
});
let sequence = 0;
export function requestNotice(url: string, method: string): Notice | undefined {
  if (["GET", "HEAD"].includes(method.toUpperCase())) return;
  if (url === "/api/preferences")
    return {
      label: "Style preferences",
      success: "Preferences saved to this workspace.",
    };
  if (url === "/api/profile")
    return { label: "Workspace profile", success: "Workspace name saved." };
  if (url.startsWith("/api/workflow-drafts"))
    return {
      label: "Workspace draft",
      success: method === "DELETE" ? "Draft discarded." : "Draft saved.",
      quiet: method !== "DELETE",
    };
  if (url.includes("/workflow-operations/") || url.endsWith("/operations"))
    return {
      label: "Task request",
      success: "Task request accepted. Check Activity for progress.",
      quiet: true,
    };
  if (url.endsWith("/context"))
    return {
      label: "Inspiration context",
      success: "Updated occasion saved.",
      quiet: true,
    };
  if (url.endsWith("/regenerate"))
    return {
      label: url.includes("/media/")
        ? "Image regeneration"
        : "Outfit regeneration",
      success: "Regeneration requested. Check Activity for progress.",
    };
  if (url.includes("/media/retry"))
    return {
      label: "Image request",
      success: "Image request accepted. Check the saved look for progress.",
    };
  if (url.includes("/shares/") || url.startsWith("/api/shares/"))
    return { label: "Share link", success: "Share link turned off." };
  if (url.endsWith("/shares"))
    return {
      label: "Share link",
      success:
        "Share link created. Only the selected items and media are included.",
    };
  if (url.includes("/products/") && url.endsWith("/wardrobe"))
    return {
      label: "Wardrobe candidate",
      success: "Candidate saved. Mark it owned when you have it.",
    };
  if (url.endsWith("/save"))
    return {
      label: "Save outfit",
      success: "Outfit saved. Avatar image has its own status.",
    };
  if (url.endsWith("/attach"))
    return {
      label: "Product choice",
      success: "Product attached to this outfit. It is still not owned.",
    };
  if (url.endsWith("/selection"))
    return { label: "Outfit choice", success: "Choice saved." };
  if (url.includes("/products/search"))
    return {
      label: "Shopping search",
      success: "Search request accepted. Check the product groups for results.",
    };
  if (url.startsWith("/api/saved-looks/") && method === "DELETE")
    return { label: "Delete saved look", success: "Saved look deleted." };
  if (url.startsWith("/api/capsules/drafts/"))
    return { label: "Capsule draft", success: "Draft saved.", quiet: true };
  if (url.startsWith("/api/capsules/") && method === "DELETE")
    return {
      label: url.includes("/outfits/")
        ? "Delete capsule outfit"
        : "Delete capsule",
      success: "Deleted from the capsule collection.",
    };
}

export async function feedbackRequest(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const notice = requestNotice(url, init?.method ?? "GET");
  if (!notice) return fetch(url, init);
  const id = `request:${init?.method ?? "GET"}:${url}:${notice.quiet ? "draft" : ++sequence}`;
  if (!notice.quiet)
    publishFeedback({
      id,
      label: notice.label,
      state: "running",
      detail: "In progress",
    });
  try {
    const response = await fetch(url, init);
    const payload: unknown = await response
      .clone()
      .json()
      .catch(() => null);
    const failure = errorSchema.safeParse(payload);
    const envelope = z
      .object({ data: z.record(z.string(), z.unknown()) })
      .safeParse(payload);
    if (!response.ok || failure.success || !envelope.success) {
      publishFeedback({
        id,
        label: notice.label,
        state: "failed",
        detail: failure.success
          ? failure.data.error.message
          : "The request could not finish. Try again.",
      });
    } else if (!notice.quiet) {
      const data = envelope.data.data;
      const imageMissing =
        notice.label === "Wardrobe candidate" &&
        data.importStatus !== "complete";
      const searchFailed =
        notice.label === "Shopping search" &&
        ["failed", "unavailable"].includes(String(data.status));
      const searchReady =
        notice.label === "Shopping search" &&
        data.status === "succeeded" &&
        Array.isArray(data.products);
      publishFeedback({
        id,
        label: notice.label,
        state: imageMissing || searchFailed ? "failed" : "complete",
        detail: imageMissing
          ? "Candidate saved, but its image could not be copied. Retry the image import."
          : searchFailed
            ? "Search could not finish. Open the product group to retry."
            : searchReady
              ? (data.products as unknown[]).length
                ? "Product results are ready to review."
                : "No products found. Adjust the search and try again."
              : notice.success,
      });
    }
    return response;
  } catch (error) {
    if (!init?.signal?.aborted)
      publishFeedback({
        id,
        label: notice.label,
        state: "failed",
        detail: "Could not connect. Check your connection and try again.",
      });
    else
      publishFeedback({
        id,
        label: notice.label,
        state: "cancelled",
        detail:
          "Request interrupted. Check its current status before trying again.",
      });
    throw error;
  }
}

export async function reportOperationResponse(response: Response, id: string) {
  if (response.ok) return;
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  const failure = errorSchema.safeParse(body);
  publishFeedback({
    id: `operation-request:${id}`,
    label: "Task request could not finish",
    state: "failed",
    detail: failure.success
      ? failure.data.error.message
      : "Open the task to check its status before retrying.",
  });
}
