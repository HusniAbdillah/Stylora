import "server-only";
import { QueueClient } from "@vercel/queue";

let client: QueueClient | undefined;
const workflowQueueRegion = "hnd1";

export function workflowQueueHostname() {
  return `${workflowQueueRegion}.vercel-queue.com`;
}

export function workflowQueueClient() {
  if (!client) {
    client = new QueueClient({
      region: workflowQueueRegion,
      ...(process.env.STYLORA_QUEUE_TOKEN?.trim()
        ? { token: process.env.STYLORA_QUEUE_TOKEN.trim() }
        : {}),
    });
  }
  return client;
}
