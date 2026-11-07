import {
  getWardrobeItem,
  mutateWardrobeItem,
} from "@/features/wardrobe/server";
import { wardrobeRoute, readJson } from "@/features/wardrobe/http";
type Context = { params: Promise<{ itemId: string }> };
export async function GET(_request: Request, context: Context) {
  const { itemId } = await context.params;
  return wardrobeRoute(() => getWardrobeItem(itemId));
}
export async function PATCH(request: Request, context: Context) {
  const { itemId } = await context.params;
  return wardrobeRoute(async () =>
    mutateWardrobeItem(itemId, await readJson(request)),
  );
}
