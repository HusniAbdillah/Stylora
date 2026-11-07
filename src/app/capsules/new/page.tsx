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

export const dynamic = "force-dynamic";

export default async function NewCapsulePage({
  searchParams,
}: {
  searchParams: Promise<{ draftId?: string }>;
}) {
  const { draftId } = await searchParams;
  if (draftId && !z.uuid().safeParse(draftId).success) notFound();
  const [draft, items] = await Promise.all([
    getCapsuleDraft(draftId),
    getCapsuleInventory(),
  ]);
  if (draftId && !draft) notFound();
  return (
    <CapsuleDraftStudio
      initial={
        draft ?? {
          id: randomUUID(),
          revision: 0,
          brief: EMPTY_CAPSULE_DRAFT,
          step: 0,
          visited: 0,
        }
      }
      ownedItems={items}
      writesEnabled={getWorkspaceDatabase().writesEnabled}
    />
  );
}
