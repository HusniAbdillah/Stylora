"use client";

import { createPreviewStore } from "./store";

type PreviewActivity = {
  id: string;
  label: string;
  detail?: string;
  state: "complete" | "failed";
};

const activity = createPreviewStore<PreviewActivity[]>(
  "activity",
  [],
  (value) =>
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.label === "string" &&
        (item.state === "complete" || item.state === "failed") &&
        (item.detail === undefined || typeof item.detail === "string"),
    ),
);

export const usePreviewActivity = activity.useValue;

export function recordPreviewActivity(
  label: string,
  state: PreviewActivity["state"],
  detail?: string,
) {
  try {
    activity.set((previous) =>
      [{ id: crypto.randomUUID(), label, state, detail }, ...previous].slice(
        0,
        20,
      ),
    );
  } catch {
    // The operation itself can succeed even when there is no room for its history.
  }
}
