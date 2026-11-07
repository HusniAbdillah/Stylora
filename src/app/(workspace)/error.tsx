"use client";

import Link from "next/link";
import { Button, RecoveryPanel } from "@/components/ui";

export default function WorkspaceError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RecoveryPanel
      kind="error"
      title="We couldn’t open this view"
      message="Try loading it again or return to your wardrobe."
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button variant="secondary" asChild>
            <Link href="/wardrobe">Open wardrobe</Link>
          </Button>
        </div>
      }
    />
  );
}
