import { apiRoute } from "@/lib/api";
import { getProfile, saveProfile } from "@/features/profile/server";

export async function GET() {
  return apiRoute(getProfile);
}

export async function PATCH(request: Request) {
  return apiRoute(async () => saveProfile(await request.json()));
}
