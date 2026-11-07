import Link from "next/link";
import { Button, RecoveryPanel } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <RecoveryPanel
        kind="not-found"
        title="We couldn’t find that page"
        message="Check the link or open your wardrobe to find a piece."
        action={
          <Button asChild>
            <Link href="/wardrobe">Open wardrobe</Link>
          </Button>
        }
      />
    </main>
  );
}
