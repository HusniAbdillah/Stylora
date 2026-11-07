import { listWardrobeItems } from "@/features/wardrobe/server";
import { wardrobeRoute } from "@/features/wardrobe/http";
export function GET(request: Request) {
  return wardrobeRoute(() =>
    listWardrobeItems(Object.fromEntries(new URL(request.url).searchParams)),
  );
}
