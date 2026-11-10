"use client";

import { useSyncExternalStore } from "react";

export type FeedbackState =
  | "queued"
  | "running"
  | "partial"
  | "complete"
  | "failed"
  | "cancelled"
  | "superseded";
export type Feedback = {
  id: string;
  label: string;
  detail?: string;
  state: FeedbackState;
  href?: string;
  onRetry?: () => void;
  toast: boolean;
  updatedAt: number;
};
type Input = Omit<Feedback, "updatedAt" | "toast"> & { toast?: boolean };
const empty: readonly Feedback[] = [];
let items: readonly Feedback[] = empty;
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useFeedback() {
  return useSyncExternalStore(
    subscribe,
    () => items,
    () => empty,
  );
}
export function publishFeedback(input: Input) {
  if (typeof window === "undefined") return;
  const previous = items.find((item) => item.id === input.id);
  const changed =
    !previous ||
    previous.state !== input.state ||
    previous.label !== input.label ||
    previous.detail !== input.detail;
  if (
    !changed &&
    (input.toast === undefined || input.toast === previous.toast) &&
    previous.href === input.href &&
    previous.onRetry === input.onRetry
  )
    return;
  const item: Feedback = {
    ...input,
    toast:
      input.toast ??
      (changed ? !isPending(input.state) : (previous?.toast ?? false)),
    updatedAt: changed ? Date.now() : previous!.updatedAt,
  };
  // Running tasks remain available even when many short actions finish.
  const remaining = items.filter((entry) => entry.id !== input.id);
  const active = remaining.filter((entry) => isPending(entry.state));
  const recent = remaining
    .filter((entry) => !isPending(entry.state))
    .slice(0, 49);
  items = [item, ...active, ...recent];
  emit();
}
export function dismissFeedback(id: string) {
  items = items.map((item) =>
    item.id === id ? { ...item, toast: false } : item,
  );
  emit();
}
export function getFeedbackSnapshot() {
  return items;
}
export function isPending(state: FeedbackState) {
  return state === "queued" || state === "running" || state === "partial";
}
export function feedbackError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The action could not finish. Try again.";
}
export async function withFeedback<T>(
  input: {
    id: string;
    label: string;
    success: string;
    href?: string;
    quiet?: boolean;
  },
  run: () => Promise<T>,
): Promise<T> {
  const { success, quiet, ...base } = input;
  if (!quiet)
    publishFeedback({ ...base, state: "running", detail: "In progress" });
  try {
    const result = await run();
    publishFeedback({
      ...base,
      state: "complete",
      detail: success,
      toast: quiet ? false : undefined,
    });
    return result;
  } catch (error) {
    publishFeedback({
      ...base,
      state: "failed",
      detail: feedbackError(error),
    });
    throw error;
  }
}
