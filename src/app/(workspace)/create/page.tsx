import { z } from "zod";
import { notFound } from "next/navigation";
import { CreatePage } from "@/features/inspiration/create-page";

export default async function InspirationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const parsed = z.uuid().optional().safeParse(query.draft);
  if (!parsed.success) notFound();
  const sample = z.literal("1").optional().safeParse(query.sample);
  if (!sample.success || (sample.data && parsed.data)) notFound();
  return (
    <CreatePage
      key={parsed.data ?? (sample.data ? "sample" : "new")}
      draftId={parsed.data}
      samplePhoto={Boolean(sample.data)}
    />
  );
}
