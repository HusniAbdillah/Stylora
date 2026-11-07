"use client";

import { Button, RecoveryPanel } from "@/components/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { z } from "zod";

export default function CapsuleError({ reset }: { reset: () => void }) {
  const { capsuleId } = useParams<{ capsuleId?: string }>();
  return (
    <div className="p-6">
      <RecoveryPanel
        kind="error"
        title="Capsule Studio could not load"
        message="Your saved work is kept. Retry to load the wardrobe and draft."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={reset}>Retry Capsule Studio</Button>
            {z.uuid().safeParse(capsuleId).success && (
              <Button asChild variant="secondary">
                <Link href={`/capsules/new?capsuleId=${capsuleId}`}>
                  Edit capsule brief
                </Link>
              </Button>
            )}
          </div>
        }
      />
    </div>
  );
}
