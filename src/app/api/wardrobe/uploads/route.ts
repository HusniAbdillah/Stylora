import { createWardrobeUpload } from "@/features/wardrobe/server";
import { wardrobeRoute, readJson } from "@/features/wardrobe/http";
export function POST(request: Request) {
  return wardrobeRoute(async () =>
    createWardrobeUpload(await readJson(request)),
  );
}
