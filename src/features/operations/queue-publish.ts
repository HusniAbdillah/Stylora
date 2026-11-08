import "server-only";
import { z } from "zod";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
} from "@/lib/supabase/server";
import { operationKindSchema } from "./schema";
import { operationLane } from "./worker-policy";
import { queueConfigured } from "./queue-config";
import { workflowQueueClient } from "./queue-client";
import { OperationError } from "./errors";

const dispatchesSchema = z
  .array(
    z.object({
      id: z.uuid(),
      operation_id: z.uuid(),
      lease_token: z.uuid(),
    }),
  )
  .max(10);

export async function publishWorkflowDispatches(limit = 3, reconcile = false) {
  if (!queueConfigured())
    throw new OperationError(
      "QUEUE_UNCONFIGURED",
      "Background delivery is unavailable.",
      503,
      true,
    );
  z.number().int().min(1).max(10).parse(limit);
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const { client, workspaceId } = context;
  if (reconcile) {
    const result = await client
      .rpc("reconcile_workflow_dispatches", {
        p_workspace_id: workspaceId,
        p_limit: 100,
      })
      .abortSignal(AbortSignal.timeout(10000));
    if (result.error)
      throw new OperationError(
        "DISPATCH_RECONCILE_UNAVAILABLE",
        "Delivery recovery is unavailable.",
        503,
        true,
      );
  }
  const claimed = await client
    .rpc("claim_workflow_dispatches", {
      p_workspace_id: workspaceId,
      p_limit: limit,
      p_lease_seconds: 60,
    })
    .abortSignal(AbortSignal.timeout(10000));
  if (claimed.error)
    throw new OperationError(
      "DISPATCH_CLAIM_UNAVAILABLE",
      "Delivery is temporarily unavailable.",
      503,
      true,
    );
  const rows = dispatchesSchema.parse(claimed.data);
  if (!rows.length) return { claimed: 0, published: 0, deferred: 0 };
  const kinds = await client
    .from("workflow_operations")
    .select("id,kind")
    .eq("workspace_id", workspaceId)
    .in(
      "id",
      rows.map((row) => row.operation_id),
    )
    .abortSignal(AbortSignal.timeout(10000));
  if (kinds.error)
    throw new OperationError(
      "DISPATCH_INPUT_UNAVAILABLE",
      "Delivery inputs are unavailable.",
      503,
      true,
    );
  const results = await Promise.allSettled(
    rows.map(async (row) => {
      let success = false;
      try {
        const kind = operationKindSchema.parse(
          kinds.data.find((op) => op.id === row.operation_id)?.kind,
        );
        if (kind === "marketplace_search")
          throw new Error("Unsupported dispatcher");
        await workflowQueueClient().send(
          `stylora-${operationLane(kind)}`,
          {
            operationId: row.operation_id,
            dispatchId: row.id,
          },
          { idempotencyKey: row.id, retentionSeconds: 604800 },
        );
        success = true;
      } catch {
        // An ambiguous send is retried with the same key after its durable lease.
      }
      const finished = await client
        .rpc("finish_workflow_dispatch", {
          p_workspace_id: workspaceId,
          p_outbox_id: row.id,
          p_lease_token: row.lease_token,
          p_success: success,
          p_error_code: success ? undefined : "QUEUE_PUBLISH_UNAVAILABLE",
        })
        .abortSignal(AbortSignal.timeout(10000));
      if (finished.error)
        throw new OperationError(
          "DISPATCH_ACK_UNAVAILABLE",
          "Delivery acknowledgement is unavailable.",
          503,
          true,
        );
      return success;
    }),
  );
  const published = results.filter(
    (result) => result.status === "fulfilled" && result.value,
  ).length;
  return { claimed: rows.length, published, deferred: rows.length - published };
}
