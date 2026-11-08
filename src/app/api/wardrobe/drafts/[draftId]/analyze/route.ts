import {
  startWardrobeAnalysis,
  getWardrobeAnalysis,
} from "@/features/wardrobe/analysis";
import { wardrobeRoute, readJson } from "@/features/wardrobe/http";
import { executorResponse } from "@/features/operations/execution-mode";
export const maxDuration = 300;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  return executorResponse(
    await wardrobeRoute(async () =>
      startWardrobeAnalysis((await params).draftId, await readJson(request)),
    ),
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  return wardrobeRoute(async () => getWardrobeAnalysis((await params).draftId));
}
