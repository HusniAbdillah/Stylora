"use client";
import { Button } from "@/components/ui";

export default function PreviewError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-4 p-8">
      <h1 className="font-serif text-3xl">Preview could not load</h1>
      <p>
        Your saved selection is kept. Check the workspace connection and try
        again.
      </p>
      <Button onClick={reset}>Retry preview</Button>
    </div>
  );
}
