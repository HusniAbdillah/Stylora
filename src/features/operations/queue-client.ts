import "server-only";
import { QueueClient } from "@vercel/queue";
import { Agent } from "undici";

let client: QueueClient | undefined;
const workflowQueueRegion = "hnd1";

export function workflowQueueHostname() {
  return `${workflowQueueRegion}.vercel-queue.com`;
}

export function workflowQueueClient() {
  if (!client) {
    const dispatcher = new Agent({
      connect: { timeout: 5000 },
      headersTimeout: 15000,
      bodyTimeout: 15000,
    });
    client = new QueueClient({
      region: workflowQueueRegion,
      dispatcher,
      ...(process.env.STYLORA_QUEUE_TOKEN?.trim()
        ? { token: process.env.STYLORA_QUEUE_TOKEN.trim() }
        : {}),
    });
  }
  return client;
}
