import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { apiRoute, ApiError } from "@/lib/api";
import { getEvents, getOperation } from "@/features/operations/create";
import { getWorkspaceDatabase } from "@/lib/supabase/server";

export const maxDuration = 60;
export async function GET(
  request: Request,
  context: { params: Promise<{ operationId: string }> },
) {
  const { operationId } = await context.params;
  const url = new URL(request.url);
  const after = url.searchParams.get("after");
  if (!request.headers.get("accept")?.includes("text/event-stream"))
    return apiRoute(async () =>
      getEvents(
        operationId,
        z.coerce
          .number()
          .int()
          .min(0)
          .parse(after ?? 0),
      ),
    );
  const authorization = await apiRoute(async () => {
    await getOperation(operationId);
    let sequence = 0;
    const lastId = request.headers.get("last-event-id");
    if (lastId) {
      z.uuid().parse(lastId);
      const { client, workspaceId } = getWorkspaceDatabase();
      const { data } = await client
        .from("workflow_operation_events")
        .select("sequence")
        .eq("workspace_id", workspaceId)
        .eq("operation_id", operationId)
        .eq("id", lastId)
        .maybeSingle();
      if (!data)
        throw new ApiError(
          "event_not_found",
          "The event cursor is unavailable.",
          404,
        );
      sequence = data.sequence;
    }
    return { sequence };
  });
  if (!authorization.ok) return authorization;
  let sequence = z
    .object({ data: z.object({ sequence: z.number() }) })
    .parse(await authorization.json()).data.sequence;
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        const deadline = Date.now() + 15_000;
        try {
          while (Date.now() < deadline && !request.signal.aborted) {
            const events = await getEvents(operationId, sequence);
            for (const event of events) {
              controller.enqueue(
                encoder.encode(
                  `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
                ),
              );
              sequence = event.sequence;
            }
            const operation = await getOperation(operationId);
            if (
              ["succeeded", "failed", "cancelled", "superseded"].includes(
                operation.status,
              )
            )
              break;
            controller.enqueue(encoder.encode(": waiting\n\n"));
            await delay(400);
          }
        } catch {
          controller.enqueue(
            encoder.encode(
              'event: failed\ndata: {"code":"event_stream_unavailable"}\n\n',
            ),
          );
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      },
    },
  );
}
