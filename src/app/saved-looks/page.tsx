import Link from "next/link";
import { StateNotice } from "@/components/ui";
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import { listSavedLooks } from "@/features/decisions/server";
import { savedListSchema } from "@/features/decisions/schemas";
import { SavedCollectionWorkspace } from "@/features/decisions/saved-workspace";
import { savedCollectionHref } from "@/features/decisions/saved-view-model";

export const dynamic = "force-dynamic";

export default async function SavedLooksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = savedListSchema.safeParse(await searchParams);
  if (!query.success)
    return (
      <StateNotice title="This saved-look view is unavailable">
        Check the address or{" "}
        <Link href="/saved-looks" className="text-crimson underline">
          open your collection
        </Link>
        .
      </StateNotice>
    );
  const collection = await listSavedLooks(query.data);
  return (
    <SavedCollectionWorkspace
      key={savedCollectionHref(
        query.data.filter,
        query.data.limit,
        query.data.cursor,
      )}
      initial={collection}
      filter={query.data.filter}
      limit={query.data.limit}
      cursor={query.data.cursor}
      writesEnabled={getWorkspaceDatabase().writesEnabled}
    />
  );
}
