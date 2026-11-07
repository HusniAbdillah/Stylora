import Link from "next/link";
import { WorkspaceShell } from "@/components/shell";
import { Button, StateNotice } from "@/components/ui";
import { getCapsuleDraft } from "@/features/capsules/drafts";

export const dynamic = "force-dynamic";

export default async function CapsulesPage() {
  const draft = await getCapsuleDraft();
  return (
    <WorkspaceShell
      activeHref="/capsules"
      displayName="Studio guest"
      activity={[]}
      breadcrumbs={[{ label: "Capsules" }]}
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-crimson">Capsule Studio</p>
          <h1 className="mt-2 font-serif text-4xl md:text-5xl">
            Small sets, <em className="text-crimson">many outfits.</em>
          </h1>
          <p className="mt-2 text-sm text-secondary">
            Build complete outfits around your own pieces and a clear purpose.
          </p>
        </div>
        <Button asChild>
          <Link href="/capsules/new">
            {draft ? "Continue draft" : "New capsule"}
          </Link>
        </Button>
      </header>
      <div className="mt-6">
        <StateNotice
          title={
            draft
              ? "Your capsule draft is ready to continue"
              : "Start with a purpose"
          }
        >
          {draft
            ? `Your ${draft.brief.includedItemIds.length} selected pieces and wizard choices are saved.`
            : "Choose one of five editable templates, then select owned pieces for your capsule."}
        </StateNotice>
      </div>
    </WorkspaceShell>
  );
}
