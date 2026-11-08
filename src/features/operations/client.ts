"use client";

import { z } from "zod";
import { operationStatusSchema } from "./schema";
import { reportOperationResponse } from "@/lib/feedback/request";
import { publishFeedback } from "@/lib/feedback/store";

const pendingRequests = new Map<string, Promise<Response>>();
const statusSchema = z
  .object({
    id: z.uuid(),
    status: operationStatusSchema,
    leaseUntil: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .passthrough();
const nestedSchema = z.object({
  data: z.object({ operation: statusSchema }).passthrough(),
});
const flatSchema = z.object({ data: statusSchema });
const previewSchema = z.object({
  data: z
    .object({
      draftId: z.uuid(),
      operationId: z.uuid(),
      job: z.object({ status: operationStatusSchema }).passthrough(),
    })
    .passthrough(),
});

type RequestSnapshot = {
  operation: z.infer<typeof statusSchema>;
  envelope?: z.infer<typeof nestedSchema>["data"];
  previewDraftId?: string;
};

async function responseOperation(
  response: Response,
): Promise<RequestSnapshot | undefined> {
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  const nested = nestedSchema.safeParse(body);
  if (nested.success)
    return {
      operation: nested.data.data.operation,
      envelope: nested.data.data,
    };
  const flat = flatSchema.safeParse(body);
  if (flat.success) return { operation: flat.data.data, envelope: undefined };
  const preview = previewSchema.safeParse(body);
  if (preview.success)
    return {
      operation: {
        id: preview.data.data.operationId,
        status: preview.data.data.job.status,
      },
      previewDraftId: preview.data.data.draftId,
    };
}

async function executeRequest(
  key: string,
  url: string,
  init: Omit<RequestInit, "signal">,
) {
  const deadline = Date.now() + 300_000;
  let response = await fetch(url, {
    method: "POST",
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(295_000),
  });
  const workerManaged = response.headers.get("x-stylora-executor") === "worker";
  let snapshot = await responseOperation(response);
  const knownId = z.uuid().safeParse(key);
  let operationId =
    snapshot?.operation.id ?? (knownId.success ? knownId.data : undefined);
  let envelope = snapshot?.envelope;
  let previewDraftId = snapshot?.previewDraftId;
  if (!operationId || (!response.ok && response.status !== 409))
    return response;

  async function readStatus(statusUrl: string): Promise<Response> {
    let failures = 0;
    while (Date.now() < deadline) {
      let latest: Response | undefined;
      try {
        latest = await fetch(statusUrl, {
          method: "GET",
          cache: "no-store",
          signal: AbortSignal.timeout(
            Math.max(1, Math.min(15_000, deadline - Date.now())),
          ),
        });
        if (![502, 503, 504].includes(latest.status)) {
          if (latest.ok) await latest.clone().arrayBuffer();
          return latest;
        }
      } catch {
        latest = undefined;
      }
      failures += 1;
      const remaining = deadline - Date.now();
      if (failures >= 8 || remaining <= 0) break;
      let delay = Math.min(1000 * 2 ** (failures - 1), 15_000);
      const retryAfter = latest?.headers.get("Retry-After");
      if (retryAfter) {
        const specified = /^\d+$/.test(retryAfter.trim())
          ? Number(retryAfter) * 1000
          : Date.parse(retryAfter) - Date.now();
        if (Number.isFinite(specified) && specified >= 0) {
          if (specified >= remaining) break;
          delay = Math.max(delay, specified);
        }
      }
      if (delay >= remaining) break;
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
    throw new Error("OPERATION_STATUS_UNAVAILABLE");
  }

  while (Date.now() < deadline) {
    if (
      snapshot &&
      ["succeeded", "failed", "cancelled", "superseded"].includes(
        snapshot.operation.status,
      )
    )
      break;
    await new Promise<void>((resolve) =>
      setTimeout(resolve, Math.min(3000, deadline - Date.now())),
    );
    if (Date.now() >= deadline) break;
    response = await readStatus(`/api/workflow-operations/${operationId}`);
    snapshot = await responseOperation(response);
    if (!response.ok || !snapshot) return response;
    const operation = snapshot.operation;
    if (
      ["succeeded", "failed", "cancelled", "superseded"].includes(
        operation.status,
      )
    )
      break;
    const expired =
      typeof operation.leaseUntil === "string" &&
      Date.parse(operation.leaseUntil) <= Date.now();
    if (!workerManaged && (operation.status === "queued" || expired)) {
      response = await fetch(url, {
        method: "POST",
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      });
      snapshot = await responseOperation(response);
      if (response.status === 409 && !snapshot) continue;
      if (!snapshot || (!response.ok && response.status !== 409))
        return response;
      operationId = snapshot.operation.id;
      envelope = snapshot.envelope ?? envelope;
      previewDraftId = snapshot.previewDraftId ?? previewDraftId;
    }
  }
  if (previewDraftId && !snapshot?.previewDraftId) {
    return readStatus(
      `/api/previews?draftId=${encodeURIComponent(previewDraftId)}`,
    );
  }
  if (envelope && snapshot) {
    return Response.json(
      { data: { ...envelope, operation: snapshot.operation } },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  return response;
}

export async function startOperationRequest(
  operationId: string,
  url: string,
  init: Omit<RequestInit, "signal"> = { method: "POST" },
): Promise<Response> {
  let pending = pendingRequests.get(operationId);
  if (!pending) {
    pending = executeRequest(operationId, url, init)
      .then(async (response) => {
        await reportOperationResponse(response, operationId);
        return response;
      })
      .catch((error) => {
        publishFeedback({
          id: `operation-request:${operationId}`,
          label: "Task connection interrupted",
          state: "failed",
          detail:
            "The task may still be running. Open it to check its current status before retrying.",
        });
        throw error;
      })
      .finally(() => pendingRequests.delete(operationId));
    pendingRequests.set(operationId, pending);
  }
  return (await pending).clone();
}

export function requestOperation(
  key: string,
  url: string,
  body: unknown,
): Promise<Response> {
  return startOperationRequest(key, url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function retryOperationRequest(
  operationId: string,
  executeUrl: string,
  body: unknown,
): Promise<Response> {
  const response = await fetch(
    `/api/workflow-operations/${operationId}/retry`,
    { method: "POST", cache: "no-store" },
  );
  if (!response.ok) {
    await reportOperationResponse(response, operationId);
    return response;
  }
  return requestOperation(operationId, executeUrl, body);
}
