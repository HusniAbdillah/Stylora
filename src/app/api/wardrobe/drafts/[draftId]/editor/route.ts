import { saveWardrobeEditor } from "@/features/wardrobe/server";
import { wardrobeRoute, readJson } from "@/features/wardrobe/http";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  return wardrobeRoute(async () =>
    saveWardrobeEditor((await params).draftId, await readJson(request)),
  );
}
