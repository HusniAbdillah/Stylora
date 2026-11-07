import { createWardrobeDraft } from "@/features/wardrobe/server";
import { wardrobeRoute, readJson } from "@/features/wardrobe/http";
export function POST(request: Request) {
  return wardrobeRoute(async () =>
    createWardrobeDraft(await readJson(request)),
  );
}
