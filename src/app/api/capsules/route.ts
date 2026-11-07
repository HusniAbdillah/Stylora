import { apiRoute } from "@/lib/api";
import { listCapsules } from "@/features/capsules/queries";

export function GET() {
  return apiRoute(listCapsules);
}
