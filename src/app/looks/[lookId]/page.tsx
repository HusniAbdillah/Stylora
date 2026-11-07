import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { WorkspaceShell } from "@/components/shell";
import { Button, StateNotice } from "@/components/ui";
import { getOutfitPage } from "@/features/products/page-data";
import { OutfitPage } from "@/features/products/outfit-page";
import { ApiError } from "@/lib/http";
import { getWorkspaceDatabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Outfit details · Stylora" };

export default async function LookPage({
  params,
  searchParams,
}: {
  params: Promise<{ lookId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ lookId }, query] = await Promise.all([params, searchParams]);
  const parsed = z
    .object({
      lookId: z.uuid(),
      optionId: z.uuid().optional(),
      step: z
        .enum(["upload", "review", "matches", "ideas", "details"])
        .optional(),
    })
    .safeParse({ lookId, optionId: query.option_id, step: query.step });
  if (!parsed.success) notFound();
  const data = await getOutfitPage(
    parsed.data.lookId,
    parsed.data.optionId,
  ).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  const { writesEnabled } = getWorkspaceDatabase();
  return (
    <WorkspaceShell
      activeHref="/create"
      displayName="Studio guest"
      breadcrumbs={[{ label: "Create" }, { label: "Outfit details" }]}
      activity={[]}
      resume={{ href: `/looks/${lookId}`, label: "Return to your look" }}
    >
      {parsed.data.step && parsed.data.step !== "details" ? (
        <div className="space-y-6 pb-12">
          <StateNotice title="This earlier step is not available here yet">
            Your outfit options and saved choices are retained. Return to outfit
            details to continue choosing pieces or save this look.
          </StateNotice>
          <Button asChild>
            <Link
              href={`/looks/${lookId}${data.activeOptionId ? `?option_id=${data.activeOptionId}` : ""}`}
            >
              Return to outfit details
            </Link>
          </Button>
        </div>
      ) : (
        <OutfitPage
          key={data.lookId}
          data={data}
          writesEnabled={writesEnabled}
        />
      )}
    </WorkspaceShell>
  );
}
