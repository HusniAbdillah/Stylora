import type { Metadata } from "next";
import { WardrobeItemDetailFlow } from "@/features/wardrobe/wardrobe-item-detail-flow";

export const metadata: Metadata = { title: "Wardrobe item · Stylora" };

export default async function WardrobeItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return <WardrobeItemDetailFlow itemId={itemId} />;
}
