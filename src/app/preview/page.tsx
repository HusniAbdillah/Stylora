import { WorkspaceShell } from "@/components/shell";
import { readPreview } from "@/features/preview/data";
import { PreviewClient } from "@/features/preview/preview-client";
import { z } from "zod";

export const dynamic = "force-dynamic";

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    capsuleId?: string;
    outfitId?: string;
    draftId?: string;
    savedLookId?: string;
  }>;
}) {
  const params = await searchParams;
  const category = z
    .enum([
      "top",
      "bottom",
      "dress",
      "outerwear",
      "shoes",
      "bags",
      "accessories",
    ])
    .catch("top")
    .parse(params.category);
  if (params.savedLookId && (params.capsuleId || params.outfitId))
    throw new Error("INVALID_PREVIEW_SOURCE");
  const source = params.savedLookId
    ? z.object({ savedLookId: z.uuid() }).parse(params)
    : params.capsuleId || params.outfitId
      ? z.object({ capsuleId: z.uuid(), outfitId: z.uuid() }).parse(params)
      : undefined;
  const draftId = params.draftId ? z.uuid().parse(params.draftId) : undefined;
  const initial = await readPreview(source, draftId);
  return (
    <WorkspaceShell
      activeHref="/preview"
      displayName={initial.displayName}
      breadcrumbs={[{ label: "Preview" }]}
      activity={[]}
      draftStatus={initial.draftId ? "saved" : undefined}
    >
      <PreviewClient
        key={`${initial.draftId ?? JSON.stringify(source) ?? "new"}:${initial.revision}`}
        initial={initial}
        category={category}
      />
    </WorkspaceShell>
  );
}
