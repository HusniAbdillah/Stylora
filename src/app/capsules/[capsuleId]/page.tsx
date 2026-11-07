import { notFound } from "next/navigation";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { getCapsuleResult } from "@/features/capsules/queries";
import { CapsuleResultScreen } from "@/features/capsules/result-screen";

export const dynamic = "force-dynamic";
export default async function CapsulePage({
  params,
  searchParams,
}: {
  params: Promise<{ capsuleId: string }>;
  searchParams: Promise<{ generate?: string }>;
}) {
  const { capsuleId } = await params;
  if (!z.uuid().safeParse(capsuleId).success) notFound();
  const { result, revision, generationNeeded } = await getCapsuleResult(
    capsuleId,
  ).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  return (
    <CapsuleResultScreen
      result={result}
      revision={revision}
      generationNeeded={
        generationNeeded || (await searchParams).generate === "1"
      }
    />
  );
}
