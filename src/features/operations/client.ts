"use client";

const pendingRequests = new Map<string, Promise<Response>>();

export async function startOperationRequest(
  operationId: string,
  url: string,
  init: Omit<RequestInit, "signal"> = { method: "POST" },
): Promise<Response> {
  let pending = pendingRequests.get(operationId);
  if (!pending) {
    pending = fetch(url, {
      method: "POST",
      ...init,
      cache: "no-store",
      signal: undefined,
    }).finally(() => pendingRequests.delete(operationId));
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
  const response = await startOperationRequest(
    `retry:${operationId}`,
    `/api/workflow-operations/${operationId}/retry`,
  );
  if (!response.ok) return response;
  return requestOperation(operationId, executeUrl, body);
}
