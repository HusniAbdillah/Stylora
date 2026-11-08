import { workflowQueueClient } from "@/features/operations/queue-client";
import {
  consumeWorkflowMessage,
  queueRetry,
} from "@/features/operations/queue-consume";
import { queueConfigured } from "@/features/operations/queue-config";

export const runtime = "nodejs";
export const maxDuration = 300;
const callback = workflowQueueClient().handleCallback(
  (message) => consumeWorkflowMessage(message, "image"),
  {
    visibilityTimeoutSeconds: 300,
    retry: queueRetry,
  },
);
export async function POST(request: Request) {
  if (
    !queueConfigured() ||
    (process.env.VERCEL !== "1" && process.env.NODE_ENV !== "development")
  )
    return Response.json(
      { error: { code: "QUEUE_UNCONFIGURED" } },
      { status: 503 },
    );
  return callback(request);
}
