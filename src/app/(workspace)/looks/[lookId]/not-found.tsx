import Link from "next/link";
import { Button, Logo, RecoveryPanel } from "@/components/ui";

export default function LookNotFound() {
  return (
    <main className="min-h-dvh bg-canvas px-4 py-8">
      <Link href="/" aria-label="Stylora home">
        <Logo />
      </Link>
      <div className="pt-16">
        <RecoveryPanel
          kind="not-found"
          title="This outfit is unavailable"
          message="The look may have been removed, or the link is incomplete. You can still open your saved looks."
          action={
            <Button asChild>
              <Link href="/saved-looks">Open saved looks</Link>
            </Button>
          }
        />
      </div>
    </main>
  );
}
