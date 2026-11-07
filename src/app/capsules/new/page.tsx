import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import {
  getCapsuleDraft,
  getCapsuleInventory,
} from "@/features/capsules/drafts";
import { EMPTY_CAPSULE_DRAFT } from "@/features/capsules/capsule-types";
import { CapsuleDraftStudio } from "@/features/capsules/studio-draft";
import { getCapsule } from "@/features/capsules/queries";
import type { CapsuleDraftState } from "@/features/capsules/schema";

export const dynamic = "force-dynamic";

export default async function NewCapsulePage({
  searchParams,
}: {
  searchParams: Promise<{
    draftId?: string;
    capsuleId?: string;
    fresh?: string;
  }>;
}) {
  const { draftId, capsuleId, fresh } = await searchParams;
  if (draftId && !z.uuid().safeParse(draftId).success) notFound();
  if (capsuleId && !z.uuid().safeParse(capsuleId).success) notFound();
  if (draftId && capsuleId) notFound();
  const [draft, items] = await Promise.all([
    capsuleId || fresh === "1"
      ? Promise.resolve(null)
      : getCapsuleDraft(draftId),
    getCapsuleInventory(),
  ]);
  const sourceId = capsuleId ?? draft?.capsuleId;
  const capsule = sourceId ? await getCapsule(sourceId) : null;
  if (draftId && !draft) notFound();
  const initial: CapsuleDraftState = draft ?? {
    id: randomUUID(),
    revision: 0,
    brief: capsule?.brief ?? EMPTY_CAPSULE_DRAFT,
    step: capsule ? 1 : 0,
    visited: capsule ? 3 : 0,
    capsuleId: capsule?.id,
    capsuleRevision: capsule?.revision,
  };
  return (
    <CapsuleDraftStudio
      key={initial.id}
      initial={initial}
      ownedItems={items}
      writesEnabled={getWorkspaceDatabase().writesEnabled}
      recoverPrevious={!capsuleId && fresh !== "1"}
      baseBrief={capsule?.brief}
    />
  );
}
