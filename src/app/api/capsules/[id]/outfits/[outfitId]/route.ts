import { apiRoute } from "@/lib/api";
import { deleteCapsule } from "@/features/capsules/mutations";

export function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; outfitId: string }> },
) {
  return apiRoute(async () => {
    const { id, outfitId } = await params;
    return deleteCapsule(id, await request.json(), outfitId);
  });
}
