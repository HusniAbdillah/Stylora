"use client";

import Link from "next/link";
import { Button, RecoveryPanel } from "@/components/ui";

export function SavedReadError({ reset }: { reset: () => void }) {
  return (
    <RecoveryPanel
      kind="error"
      title="Saved looks could not be loaded"
      message="Your saved outfits have not been changed. Try loading them again."
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button variant="quiet" asChild>
            <Link href="/saved-looks">Back to collection</Link>
          </Button>
        </div>
      }
    />
  );
}
