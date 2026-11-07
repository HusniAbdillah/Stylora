import { apiRoute } from "@/lib/api";
import { listCapsules } from "@/features/capsules/queries";
import { prepareCapsule } from "@/features/capsules/generate";

export function GET() {
  return apiRoute(listCapsules);
}
export function POST(request: Request) {
  return apiRoute(async () => prepareCapsule(await request.json()));
}
