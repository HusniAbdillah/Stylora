import { z } from "zod";
import { feedbackRequest } from "./feedback/request";

const failureSchema = z.object({
  error: z.object({
    code: z.string().min(1).max(100),
    message: z.string().min(1).max(500),
    retryable: z.boolean().optional(),
  }),
});

export class BrowserApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "BrowserApiError";
  }
}

export async function requestData<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let response: Response;
  try {
    response = await feedbackRequest(url, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new BrowserApiError(
      "NETWORK_UNAVAILABLE",
      "Could not connect. Check your connection and try again.",
      0,
      true,
    );
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = failureSchema.safeParse(payload);
    if (failure.success) {
      const { code, message, retryable } = failure.data.error;
      throw new BrowserApiError(code, message, response.status, retryable);
    }
    throw new BrowserApiError(
      "REQUEST_FAILED",
      "The request could not be completed. Try again.",
      response.status,
      response.status >= 500,
    );
  }
  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    throw new BrowserApiError(
      "RESPONSE_UNAVAILABLE",
      "The response could not be read. Refresh and try again.",
      502,
      true,
    );
  }
  return payload.data as T;
}
