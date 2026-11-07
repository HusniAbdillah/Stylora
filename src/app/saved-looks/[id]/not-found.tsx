import Link from "next/link";
import { WorkspaceShell } from "@/components/shell";
import { Button, RecoveryPanel } from "@/components/ui";

export default function NotFound() {
  return (
    <WorkspaceShell
      activeHref="/saved-looks"
      displayName="Studio guest"
      activity={[]}
      breadcrumbs={[{ label: "Saved looks" }]}
    >
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
    </WorkspaceShell>
  );
}
