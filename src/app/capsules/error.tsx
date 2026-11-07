"use client";

import { Button, RecoveryPanel } from "@/components/ui";

export default function CapsuleError({ reset }: { reset: () => void }) {
  return (
    <div className="p-6">
      <RecoveryPanel
        kind="error"
        title="Capsule Studio could not load"
        message="Your saved work is kept. Retry to load the wardrobe and draft."
        action={<Button onClick={reset}>Retry Capsule Studio</Button>}
      />
    </div>
  );
}
