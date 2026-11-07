import { apiRoute } from "@/lib/api";
import { verifyInspirationUpload } from "@/features/inspiration/server";

type Context = { params: Promise<{ assetId: string }> };

export async function POST(request: Request, context: Context) {
  return apiRoute(async () =>
    verifyInspirationUpload(
      (await context.params).assetId,
      await request.json(),
    ),
  );
}
