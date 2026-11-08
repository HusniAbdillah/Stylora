import { z } from "zod";
import { apiRoute } from "@/lib/api";
import { ApiError, readJson } from "@/lib/http";
import { operationResponse } from "@/features/operations/http";
import { executeQueuedOperation } from "@/features/operations/worker";
import {
  authorizeWorkflowWorker,
  usesWorkflowWorker,
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
    executionMode: usesWorkflowWorker() ? "worker" : "inline",
  }));
}

export async function POST(request: Request) {
  if (!authorizeWorkflowWorker(request)) return unauthorized();
  return operationResponse(async () => {
    if (!usesWorkflowWorker()) return { executionMode: "inline" };
    const body = z
      .strictObject({ operationId: z.uuid() })
      .safeParse(await readJson(request));
    if (!body.success)
      throw new ApiError("INVALID_INPUT", "Choose a valid operation.", 400);
    return executeQueuedOperation(body.data.operationId);
  });
}
