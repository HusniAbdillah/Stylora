import { getCapsuleDraft } from "@/features/capsules/drafts";
import { listCapsules } from "@/features/capsules/queries";
import { CapsuleCollectionScreen } from "@/features/capsules/collection-screen";

export const dynamic = "force-dynamic";

export default async function CapsulesPage() {
  const [draft, capsules] = await Promise.all([
    getCapsuleDraft(),
    listCapsules(),
  ]);
  return <CapsuleCollectionScreen capsules={capsules} draft={draft} />;
}
