import "server-only";
import { z } from "zod";
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import { readOperation, OperationError } from "./server";

const eventSchema = z.object({
  id: z.uuid(),
  operation_id: z.uuid(),
  source_revision: z.number().int().positive(),
  sequence: z.number().int().positive(),
  event_type: z.enum([
    "started",
    "piece_completed",
    "confidence_completed",
    "completed",
    "failed",
    "superseded",
    "cancelled",
  ]),
  payload: z.record(z.string(), z.json()),
});

export async function readOperationEvents(
  operationId: string,
  lastEventId?: string,
) {
  await readOperation(operationId);
  const context = getWorkspaceDatabase();
  let sequence = 0;
  if (lastEventId) {
    if (!z.uuid().safeParse(lastEventId).success)
      throw new OperationError(
        "INVALID_EVENT_CURSOR",
        "Reload the operation to reconnect.",
        400,
      );
    const cursor = await context.client
      .from("workflow_operation_events")
      .select("sequence")
      .eq("workspace_id", context.workspaceId)
      .eq("operation_id", operationId)
      .eq("id", lastEventId)
      .maybeSingle();
    if (cursor.error || !cursor.data)
      throw new OperationError(
        "INVALID_EVENT_CURSOR",
        "Reload the operation to reconnect.",
        400,
      );
    sequence = cursor.data.sequence;
  }
  const { data, error } = await context.client
    .from("workflow_operation_events")
    .select("*")
    .eq("workspace_id", context.workspaceId)
    .eq("operation_id", operationId)
    .gt("sequence", sequence)
    .order("sequence", { ascending: true })
    .limit(50);
  if (error)
    throw new OperationError(
      "OPERATION_EVENTS_UNAVAILABLE",
      "The operation status could not be refreshed.",
      503,
      true,
    );
  return z
    .array(eventSchema)
    .parse(data)
    .map((event) => ({
      eventId: event.id,
      operationId: event.operation_id,
      sourceRevision: event.source_revision,
      sequence: event.sequence,
      type: event.event_type,
      payload: event.payload,
    }));
}
