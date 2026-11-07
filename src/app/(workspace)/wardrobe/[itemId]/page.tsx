import { getWardrobeItem } from "@/features/wardrobe/server";
import type { Metadata } from "next";
import { WardrobeItemDetailFlow } from "@/features/wardrobe/wardrobe-item-detail-flow";

export const metadata: Metadata = { title: "Wardrobe item · Stylora" };

export default async function WardrobeItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const item = await getWardrobeItem(itemId).catch(() => undefined);
  return (
    <WardrobeItemDetailFlow
      itemId={itemId}
      initialItem={item}
      initialError={
        item
          ? undefined
          : "This piece could not be loaded. Retry after checking the connection."
      }
    />
  );
}
