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
  return <CreatePage key={parsed.data ?? "new"} draftId={parsed.data} />;
}
