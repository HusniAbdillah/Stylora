"use client";

import Link from "next/link";
import { Button, RecoveryPanel } from "@/components/ui";

export default function LookError({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-dvh bg-canvas px-4 py-16">
      <RecoveryPanel
        kind="error"
        title="Your outfit could not be loaded"
        message="Your saved choices are still there. Try loading this look again."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={reset}>Try again</Button>
            <Button variant="secondary" asChild>
              <Link href="/saved-looks">Open saved looks</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
