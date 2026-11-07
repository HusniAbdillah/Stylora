import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { LiveWorkspace } from "@/components/shell/live-workspace";
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
      draftId: z.uuid().optional(),
      step: z
        .enum(["upload", "review", "matches", "ideas", "details"])
        .optional(),
    })
    .safeParse({
      lookId,
      optionId: query.option_id,
      draftId: query.draft,
      step: query.step,
    });
  if (!parsed.success) notFound();
  if (parsed.data.step && parsed.data.step !== "details") {
    const draft = z.uuid().optional().safeParse(query.draft);
    if (!draft.success) notFound();
    const target = `/create/${parsed.data.lookId}`;
    const parameters = new URLSearchParams();
    parameters.set("step", parsed.data.step);
    if (draft.data) parameters.set("draft", draft.data);
    if (parsed.data.optionId) parameters.set("option_id", parsed.data.optionId);
    redirect(`${target}${parameters.size ? `?${parameters}` : ""}`);
  }
  const data = await getOutfitPage(
    parsed.data.lookId,
    parsed.data.optionId,
  ).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  const { client, workspaceId, writesEnabled } = getWorkspaceDatabase();
  let draftQuery = client
    .from("workflow_drafts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("look_id", lookId)
    .eq("feature_kind", "inspiration")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (parsed.data.draftId)
    draftQuery = draftQuery.eq("id", parsed.data.draftId);
  const { data: draft, error: draftError } = await draftQuery.maybeSingle();
  if (draftError)
    throw new ApiError(
      "DRAFT_UNAVAILABLE",
      "The look draft could not be restored. Reload to try again.",
      503,
      true,
    );
  if (parsed.data.draftId && !draft) notFound();
  return (
    <LiveWorkspace>
      <OutfitPage
        key={data.lookId}
        data={data}
        createDraftId={draft?.id}
        writesEnabled={writesEnabled}
      />
    </LiveWorkspace>
  );
}
