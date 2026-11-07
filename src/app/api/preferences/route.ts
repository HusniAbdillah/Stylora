import { apiRoute } from "@/lib/api";
import { getPreferences, savePreferences } from "@/features/preferences/server";

export async function GET() {
  return apiRoute(getPreferences);
}

export async function PATCH(request: Request) {
  return apiRoute(async () => savePreferences(await request.json()));
}
