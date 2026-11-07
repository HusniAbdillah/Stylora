"use client";

import { SavedReadError } from "@/features/decisions/saved-read-error";

export default function Error({ reset }: { reset: () => void }) {
  return <SavedReadError reset={reset} />;
}
