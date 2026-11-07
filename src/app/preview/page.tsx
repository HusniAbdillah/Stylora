import { WorkspaceShell } from "@/components/shell";
import { readPreview } from "@/features/preview/data";
import { PreviewClient } from "@/features/preview/preview-client";
import { z } from "zod";

export const dynamic = "force-dynamic";

export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const params = await searchParams;
  const category = z.enum(["top", "bottom", "dress", "outerwear", "shoes", "bags", "accessories"]).catch("top").parse(params.category);
  const initial = await readPreview();
  return (
    <WorkspaceShell
      activeHref="/preview"
      displayName={initial.displayName}
      breadcrumbs={[{ label: "Preview" }]}
      activity={[]}
    >
      <PreviewClient initial={initial} category={category} />
    </WorkspaceShell>
  );
}
