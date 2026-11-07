"use client";
import { Button } from "@/components/ui";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="py-10">
      <h1 className="font-serif text-4xl">Create is unavailable</h1>
      <p className="my-4 text-secondary">
        Your saved draft is retained. Reload to try again.
      </p>
      <Button onClick={reset}>Retry</Button>
    </section>
  );
}
