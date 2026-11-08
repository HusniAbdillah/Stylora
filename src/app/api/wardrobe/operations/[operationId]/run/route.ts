import { executeWardrobeAnalysis } from "@/features/wardrobe/analysis";
import { wardrobeRoute } from "@/features/wardrobe/http";
import {
  executorResponse,
  usesWorkflowWorker,
} from "@/features/operations/execution-mode";
import { readOperation, operationStatus } from "@/features/operations/server";
export const maxDuration = 300;
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ operationId: string }> },
) {
  const { operationId } = await params;
  if (usesWorkflowWorker())
    return executorResponse(
      await wardrobeRoute(async () => {
        const operation = await readOperation(operationId);
        if (operation.kind !== "wardrobe_description")
          throw new Error("Unexpected operation kind");
        return { operation: operationStatus(operation) };
      }),
    );
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let connected = true;
      const send = (value: unknown) => {
        if (connected) {
          try {
            controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
          } catch {
            connected = false;
          }
        }
      };
      const response = await wardrobeRoute(async () =>
        executeWardrobeAnalysis(operationId, (piece, index) =>
          send({ type: "piece", piece, index, provisional: true }),
        ),
      );
      send(
        response.ok
          ? { type: "complete", ...(await response.json()) }
          : { type: "error", ...(await response.json()) },
      );
      try {
        controller.close();
      } catch {
        /* The result remains persisted after a disconnected reader. */
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
