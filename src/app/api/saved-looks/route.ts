import { apiResponse } from "@/lib/http";
import { listSavedLooks } from "@/features/decisions/server";
import { savedListSchema } from "@/features/decisions/schemas";

export async function GET(request: Request) {
  return apiResponse(async () => {
    const input = savedListSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return listSavedLooks(input);
  });
}
