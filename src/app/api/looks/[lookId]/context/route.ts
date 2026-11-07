import { apiRoute } from "@/lib/api";
import { updateLookContext } from "@/features/inspiration/context";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ lookId: string }> },
) {
  return apiRoute(async () => {
    const { lookId } = await context.params;
    return updateLookContext(lookId, await request.json());
  });
}
