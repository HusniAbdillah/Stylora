import { notFound } from "next/navigation";
import { z } from "zod";
import { getCapsuleResult } from "@/features/capsules/queries";
import { CapsuleResultScreen } from "@/features/capsules/result-screen";

export const dynamic = "force-dynamic";
export default async function CapsuleOutfitPage({
  params,
}: {
  params: Promise<{ capsuleId: string; outfitId: string }>;
}) {
  const { capsuleId, outfitId } = await params;
  if (
    !z.uuid().safeParse(capsuleId).success ||
    !z.uuid().safeParse(outfitId).success
  )
    notFound();
  const { result, revision, generationNeeded, contextKey } =
    await getCapsuleResult(capsuleId);
  if (!result.outfits.some((outfit) => outfit.id === outfitId)) notFound();
  return (
    <CapsuleResultScreen
      result={result}
      revision={revision}
      generationNeeded={generationNeeded}
      contextKey={contextKey}
      outfitId={outfitId}
    />
  );
}
