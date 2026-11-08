import { apiRoute } from "@/lib/api";
import { generateCapsule } from "@/features/capsules/generate";
import {
  executorResponse,
  usesBackgroundExecution,
} from "@/features/operations/execution-mode";

export const maxDuration = 300;
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return executorResponse(
    await apiRoute(async () =>
      generateCapsule((await params).id, {
        execute: !usesBackgroundExecution(),
      }),
    ),
  );
}
