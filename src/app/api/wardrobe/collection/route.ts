import { listWardrobeCollection } from "@/features/wardrobe/server";
import { wardrobeRoute } from "@/features/wardrobe/http";

export function GET(request: Request) {
  return wardrobeRoute(() =>
    listWardrobeCollection(
      Object.fromEntries(new URL(request.url).searchParams),
    ),
  );
}
