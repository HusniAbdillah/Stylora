export const createOperationKinds = [
  "inspiration_description",
  "inspiration_confidence",
  "wardrobe_match",
  "outfit_options",
  "option_regeneration",
] as const;

export const workerOperationKinds = [
  ...createOperationKinds,
  "wardrobe_description",
  "capsule_generation",
  "preview_image",
  "saved_avatar",
] as const;

export function operationLane(kind: string): "image" | "text" {
  return kind === "preview_image" || kind === "saved_avatar" ? "image" : "text";
}

type Candidate = {
  status: string;
  lease_until: string | null;
  attempt_count: number;
  result_ref: unknown;
  next_attempt_at?: string | null;
};

export function operationIsDue(row: Candidate, now = Date.now()): boolean {
  if (row.status === "queued")
    return !row.next_attempt_at || Date.parse(row.next_attempt_at) <= now;
  if (row.status === "failed") {
    const result = row.result_ref;
    return (
      row.attempt_count < 3 &&
      !!result &&
      typeof result === "object" &&
      "retryable" in result &&
      result.retryable === true
    );
  }
  // Expired attempts must reach the claim RPC even when exhausted, so it can
  // publish the terminal state rather than leave a running job forever.
  return (
    ["running", "partial"].includes(row.status) &&
    row.lease_until !== null &&
    Date.parse(row.lease_until) <= now
  );
}
