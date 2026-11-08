import { z } from "zod";
import { apiRoute } from "@/lib/api";
import { ApiError, readJson } from "@/lib/http";
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import { workflowWorkerHealth } from "@/features/operations/health";
import { operationResponse } from "@/features/operations/http";
import { executeQueuedOperation } from "@/features/operations/worker";
import {
  authorizeWorkflowWorker,
  usesWorkflowWorker,
  workflowExecutionMode,
} from "@/features/operations/execution-mode";

export const runtime = "nodejs";
export const maxDuration = 300;

function unauthorized() {
  return Response.json(
    { error: { code: "worker_unavailable" } },
    {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function GET(request: Request) {
  if (!authorizeWorkflowWorker(request)) return unauthorized();
  return apiRoute(async () => ({
    executionMode: workflowExecutionMode(),
    workspaceId: getWorkspaceDatabase().workspaceId,
    worker: await workflowWorkerHealth(),
  }));
}

export async function POST(request: Request) {
  if (!authorizeWorkflowWorker(request)) return unauthorized();
  return operationResponse(async () => {
    if (!usesWorkflowWorker())
      return { executionMode: workflowExecutionMode() };
    const body = z
      .strictObject({ operationId: z.uuid() })
      .safeParse(await readJson(request));
    if (!body.success)
      throw new ApiError("INVALID_INPUT", "Choose a valid operation.", 400);
    return executeQueuedOperation(body.data.operationId);
  });
}
