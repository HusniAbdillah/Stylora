"use client";

import { z } from "zod";
import { operationStatusSchema } from "./schema";

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

async function responseOperation(response: Response) {
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
    signal: undefined,
  });
  let snapshot = await responseOperation(response);
  const knownId = z.uuid().safeParse(key);
  let operationId =
    snapshot?.operation.id ?? (knownId.success ? knownId.data : undefined);
  let envelope = snapshot?.envelope;
  if (!operationId || (!response.ok && response.status !== 409))
    return response;

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
    response = await fetch(`/api/workflow-operations/${operationId}`, {
      method: "GET",
      cache: "no-store",
    });
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
    if (operation.status === "queued" || expired) {
      response = await fetch(url, {
        method: "POST",
        ...init,
        cache: "no-store",
        signal: undefined,
      });
      snapshot = await responseOperation(response);
      if (response.status === 409 && !snapshot) continue;
      if (!snapshot || (!response.ok && response.status !== 409))
        return response;
      operationId = snapshot.operation.id;
      envelope = snapshot.envelope ?? envelope;
    }
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
    pending = executeRequest(operationId, url, init).finally(() =>
      pendingRequests.delete(operationId),
    );
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
  if (!response.ok) return response;
  return requestOperation(operationId, executeUrl, body);
}
