import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalJson(entry)]),
    );
  }
  return value;
}

export function fingerprintOperationInput(input: unknown): string {
  const parsed = z.json().parse(input);
  return createHash("sha256")
    .update(JSON.stringify(canonicalJson(parsed)))
    .digest("hex");
}
