import { apiRoute } from "@/lib/api";
import { getCapsuleResult } from "@/features/capsules/queries";
import { deleteCapsule, updateCapsule } from "@/features/capsules/mutations";

type Context = { params: Promise<{ id: string }> };
export function GET(_request: Request, context: Context) {
  return apiRoute(async () => getCapsuleResult((await context.params).id));
}
export function PATCH(request: Request, context: Context) {
  return apiRoute(async () =>
    updateCapsule((await context.params).id, await request.json()),
  );
}
export function DELETE(request: Request, context: Context) {
  return apiRoute(async () =>
    deleteCapsule((await context.params).id, await request.json()),
  );
}
