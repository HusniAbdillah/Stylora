import { z } from "zod";
import { notFound } from "next/navigation";
import { CreatePage } from "@/features/inspiration/create-page";

export default async function LookStepsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lookId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [path, query] = await Promise.all([params, searchParams]);
  const parsed = z
    .object({
      lookId: z.uuid(),
      draft: z.uuid().optional(),
      option_id: z.uuid().optional(),
      step: z.enum(["upload", "review", "matches", "ideas"]).default("review"),
    })
    .safeParse({ ...query, lookId: path.lookId });
  if (!parsed.success) notFound();
  return (
    <CreatePage
      key={`${parsed.data.lookId}:${parsed.data.draft ?? "restore"}`}
      lookId={parsed.data.lookId}
      draftId={parsed.data.draft}
      step={parsed.data.step}
      optionId={parsed.data.option_id}
    />
  );
}
