import { apiRoute } from "@/lib/api";
import { createInspirationUpload } from "@/features/inspiration/server";

export async function POST(request: Request) {
  return apiRoute(async () => createInspirationUpload(await request.json()));
}
