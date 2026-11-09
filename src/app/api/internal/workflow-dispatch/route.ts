import { timingSafeEqual } from "node:crypto";
import { workflowExecutionMode } from "@/features/operations/execution-mode";
import { publishWorkflowDispatches } from "@/features/operations/queue-publish";
import { operationResponse } from "@/features/operations/http";
import { OperationError } from "@/features/operations/errors";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const expected = process.env.STYLORA_DISPATCH_SECRET ?? "";
  const supplied =
    request.headers
      .get("authorization")
      ?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1] ?? "";
  if (
    !/^[A-Za-z0-9_-]{43,128}$/.test(expected) ||
    supplied.length !== expected.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
  )
    return Response.json(
      { error: { code: "DISPATCH_UNAUTHORIZED" } },
      { status: 401 },
    );
  return operationResponse(async () => {
    if (workflowExecutionMode() !== "queue")
      return { executionMode: workflowExecutionMode() };
    const limit = z.coerce.number().int().min(1).max(3).safeParse(
      new URL(request.url).searchParams.get("limit") ?? "3",
    );
    if (!limit.success)
      throw new OperationError(
        "DISPATCH_LIMIT_INVALID",
        "Dispatch limit must be between one and three.",
        400,
      );
    return publishWorkflowDispatches(limit.data, true);
  });
}
