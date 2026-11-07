"use client";

import { Button, Logo, StateNotice } from "@/components/ui";

export default function SharedLookError({ reset }: { reset: () => void }) {
  return (
    <main className="min-h-dvh bg-porcelain px-6 py-4 sm:px-10 lg:px-16">
      <Logo />
      <div className="mx-auto mt-28 max-w-lg">
        <StateNotice
          title="This shared look could not be loaded"
          action={<Button onClick={reset}>Try again</Button>}
        >
          The service may be temporarily unavailable. Try loading the page
          again.
        </StateNotice>
      </div>
    </main>
  );
}
