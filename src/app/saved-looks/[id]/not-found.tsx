import Link from "next/link";
import { Button, RecoveryPanel } from "@/components/ui";

export default function NotFound() {
  return (
    <RecoveryPanel
      kind="not-found"
      title="This saved look is unavailable"
      message="It may have been removed from this shared workspace."
      action={
        <Button asChild>
          <Link href="/saved-looks">Back to saved looks</Link>
        </Button>
      }
    />
  );
}
