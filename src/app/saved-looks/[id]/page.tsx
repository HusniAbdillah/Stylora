import { notFound } from "next/navigation";
import { ApiError } from "@/lib/http";
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import { getSavedLook } from "@/features/decisions/server";
import { savedParamsSchema } from "@/features/decisions/schemas";
import { SavedDetailWorkspace } from "@/features/decisions/saved-workspace";
import { savedReturnHref } from "@/features/decisions/saved-view-model";

export const dynamic = "force-dynamic";

export default async function SavedLookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const parsed = savedParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  let saved;
  try {
    saved = await getSavedLook(parsed.data.id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const backHref = savedReturnHref((await searchParams).returnTo);
  return (
    <div className="pb-28 md:pb-8">
      <SavedDetailWorkspace
        key={saved.id}
        initial={saved}
        backHref={backHref}
        writesEnabled={getWorkspaceDatabase().writesEnabled}
      />
    </div>
  );
}
