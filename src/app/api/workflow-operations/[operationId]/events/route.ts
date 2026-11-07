import { operationResponse } from "@/features/operations/http";
import { readOperationEvents } from "@/features/operations/events";

export async function GET(
  request: Request,
  context: { params: Promise<{ operationId: string }> },
) {
  const response = await operationResponse(async () =>
    readOperationEvents(
      (await context.params).operationId,
      request.headers.get("Last-Event-ID") ??
        new URL(request.url).searchParams.get("after") ??
        undefined,
    ),
  );
  if (
    !response.ok ||
    !request.headers.get("Accept")?.includes("text/event-stream")
  )
    return response;
  const result: { data: Awaited<ReturnType<typeof readOperationEvents>> } =
    await response.json();
  const body = result.data
    .map(
      (event) =>
        `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
    )
    .join("");
  return new Response(`retry: 1500\n\n${body}`, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
