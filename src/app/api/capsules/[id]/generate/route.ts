import { apiRoute } from "@/lib/api";
import { generateCapsule } from "@/features/capsules/generate";

export const maxDuration = 300;
export function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return apiRoute(async () => generateCapsule((await params).id));
}
