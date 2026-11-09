import "server-only";
import {
  BadRequestError,
  ConsumerDiscoveryError,
  ConsumerRegistryNotConfiguredError,
  ForbiddenError,
  InternalServerError,
  PayloadTooLargeError,
  TooManyRequestsError,
  UnauthorizedError,
} from "@vercel/queue";
import { z } from "zod";
import {
  getWorkspaceDatabase,
  requireWorkspaceWrites,
} from "@/lib/supabase/server";
import { operationKindSchema } from "./schema";
import { operationLane } from "./worker-policy";
import { queueConfigured } from "./queue-config";
import { workflowQueueClient, workflowQueueHostname } from "./queue-client";
import { OperationError } from "./errors";

const dispatchesSchema = z
  .array(
    z.object({
      id: z.uuid(),
      operation_id: z.uuid(),
      lease_token: z.uuid(),
    }),
  )
  .max(10);

const transportErrorCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const clientErrorCodes = new Set(["UND_ERR_INVALID_ARG"]);

function queueTransportErrorCode(
  error: unknown,
  codes = transportErrorCodes,
) {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    const cause = current.cause;
    if (
      typeof cause === "object" &&
      cause !== null &&
      "code" in cause &&
      typeof cause.code === "string" &&
      codes.has(cause.code)
    )
      return cause.code;
    current = cause;
  }
  return null;
}

function queuePublishErrorCode(error: unknown) {
  if (error instanceof UnauthorizedError) return "QUEUE_AUTH_UNAUTHORIZED";
  if (error instanceof ForbiddenError) return "QUEUE_ACCESS_FORBIDDEN";
  if (error instanceof ConsumerRegistryNotConfiguredError)
    return "QUEUE_CONSUMER_REGISTRY_MISSING";
  if (error instanceof ConsumerDiscoveryError)
    return "QUEUE_CONSUMER_DISCOVERY_FAILED";
  if (error instanceof TooManyRequestsError) return "QUEUE_RATE_LIMITED";
  if (error instanceof BadRequestError) return "QUEUE_REQUEST_INVALID";
  if (error instanceof PayloadTooLargeError) return "QUEUE_PAYLOAD_TOO_LARGE";
  if (error instanceof InternalServerError) return "QUEUE_SERVICE_ERROR";
  if (error instanceof TypeError) {
    const transportCode = queueTransportErrorCode(error);
    const clientCode = queueTransportErrorCode(error, clientErrorCodes);
    if (clientCode) return `QUEUE_CLIENT_${clientCode}`;
    return transportCode
      ? `QUEUE_NETWORK_${transportCode}`
      : "QUEUE_NETWORK_ERROR";
  }
  if (error instanceof DOMException && error.name === "TimeoutError")
    return "QUEUE_REQUEST_TIMEOUT";
  return "QUEUE_PUBLISH_UNAVAILABLE";
}

type ErrorDiagnostic = {
  name: string;
  message: string;
  code: string | null;
  httpStatus: number | null;
};

function sanitizeDiagnosticText(value: unknown, maximumLength = 280) {
  if (typeof value !== "string") return "Unavailable";
  const withoutUrlCredentials = value.replace(
    /https?:\/\/[^\s"']+/gi,
    (rawUrl) => {
      try {
        const url = new URL(rawUrl);
        return `${url.protocol}//${url.hostname}${url.pathname}`;
      } catch {
        return "[URL_REDACTED]";
      }
    },
  );
  return withoutUrlCredentials
    .replace(
      /\b(authorization|bearer|token|api[_-]?key|secret|password)\b(\s*[:=]\s*|\s+)(?:Bearer\s+)?[^\s,;]+/gi,
      "$1$2[REDACTED]",
    )
    .slice(0, maximumLength);
}

function errorProperty(error: unknown, key: string): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  return (error as Record<string, unknown>)[key];
}

function diagnosticCode(error: unknown) {
  const code = errorProperty(error, "code");
  return typeof code === "string" && /^[A-Z0-9_:-]{1,64}$/.test(code)
    ? code
    : null;
}

function diagnosticHttpStatus(error: unknown) {
  const candidates = [
    errorProperty(error, "status"),
    errorProperty(error, "statusCode"),
    errorProperty(errorProperty(error, "response"), "status"),
  ];
  return (
    candidates.find(
      (value): value is number =>
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 100 &&
        value <= 599,
    ) ?? null
  );
}

function diagnosticError(error: unknown): ErrorDiagnostic {
  return {
    name: sanitizeDiagnosticText(errorProperty(error, "name"), 120),
    message: sanitizeDiagnosticText(errorProperty(error, "message")),
    code: diagnosticCode(error),
    httpStatus: diagnosticHttpStatus(error),
  };
}

function queuePublishDiagnostic(error: unknown) {
  const causes: ErrorDiagnostic[] = [];
  const seen = new Set<object>();
  let current = errorProperty(error, "cause");
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (typeof current === "object") {
      if (seen.has(current)) break;
      seen.add(current);
    }
    causes.push(diagnosticError(current));
    current = errorProperty(current, "cause");
  }
  return {
    targetHostname: workflowQueueHostname(),
    error: diagnosticError(error),
    causes,
  };
}

export async function publishWorkflowDispatches(limit = 3, reconcile = false) {
  if (!queueConfigured())
    throw new OperationError(
      "QUEUE_UNCONFIGURED",
      "Background delivery is unavailable.",
      503,
      true,
    );
  z.number().int().min(1).max(10).parse(limit);
  const context = getWorkspaceDatabase();
  requireWorkspaceWrites(context);
  const { client, workspaceId } = context;
  if (reconcile) {
    const result = await client
      .rpc("reconcile_workflow_dispatches", {
        p_workspace_id: workspaceId,
        p_limit: 100,
      })
      .abortSignal(AbortSignal.timeout(10000));
    if (result.error)
      throw new OperationError(
        "DISPATCH_RECONCILE_UNAVAILABLE",
        "Delivery recovery is unavailable.",
        503,
        true,
      );
  }
  const claimed = await client
    .rpc("claim_workflow_dispatches", {
      p_workspace_id: workspaceId,
      p_limit: limit,
      p_lease_seconds: 60,
    })
    .abortSignal(AbortSignal.timeout(10000));
  if (claimed.error)
    throw new OperationError(
      "DISPATCH_CLAIM_UNAVAILABLE",
      "Delivery is temporarily unavailable.",
      503,
      true,
    );
  const rows = dispatchesSchema.parse(claimed.data);
  if (!rows.length) return { claimed: 0, published: 0, deferred: 0 };
  const kinds = await client
    .from("workflow_operations")
    .select("id,kind")
    .eq("workspace_id", workspaceId)
    .in(
      "id",
      rows.map((row) => row.operation_id),
    )
    .abortSignal(AbortSignal.timeout(10000));
  if (kinds.error)
    throw new OperationError(
      "DISPATCH_INPUT_UNAVAILABLE",
      "Delivery inputs are unavailable.",
      503,
      true,
    );
  const results = await Promise.allSettled(
    rows.map(async (row) => {
      let success = false;
      let errorCode = "QUEUE_PUBLISH_UNAVAILABLE";
      try {
        const kind = operationKindSchema.parse(
          kinds.data.find((op) => op.id === row.operation_id)?.kind,
        );
        if (kind === "marketplace_search")
          throw new Error("Unsupported dispatcher");
        await workflowQueueClient().send(
          `stylora-${operationLane(kind)}`,
          {
            operationId: row.operation_id,
            dispatchId: row.id,
          },
          { idempotencyKey: row.id, retentionSeconds: 604800 },
        );
        success = true;
      } catch (error) {
        // An ambiguous send is retried with the same key after its durable lease.
        errorCode = queuePublishErrorCode(error);
        console.warn(
          JSON.stringify({
            event: "workflow_queue_publish_failed",
            code: errorCode,
            operationId: row.operation_id,
            ...queuePublishDiagnostic(error),
          }),
        );
      }
      const finished = await client
        .rpc("finish_workflow_dispatch", {
          p_workspace_id: workspaceId,
          p_outbox_id: row.id,
          p_lease_token: row.lease_token,
          p_success: success,
          p_error_code: success ? undefined : errorCode,
        })
        .abortSignal(AbortSignal.timeout(10000));
      if (finished.error)
        throw new OperationError(
          "DISPATCH_ACK_UNAVAILABLE",
          "Delivery acknowledgement is unavailable.",
          503,
          true,
        );
      return success;
    }),
  );
  const published = results.filter(
    (result) => result.status === "fulfilled" && result.value,
  ).length;
  return { claimed: rows.length, published, deferred: rows.length - published };
}
