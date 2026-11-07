import { apiResponse } from "@/lib/http";
import { deleteSavedLook, getSavedLook } from "@/features/decisions/server";
import { savedParamsSchema } from "@/features/decisions/schemas";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return apiResponse(async () =>
    getSavedLook(savedParamsSchema.parse(await context.params).id),
  );
}

export async function DELETE(_request: Request, context: Context) {
  return apiResponse(async () =>
    deleteSavedLook(savedParamsSchema.parse(await context.params).id),
  );
}
