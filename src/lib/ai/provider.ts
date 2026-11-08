import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import { ApiError } from "../api";
import { buildFashionPrompt, type FashionTask } from "../../prompts/fashion";
import type { Garment } from "./fashion-schema";
import {
  getFashionTaskSettings,
  fashionTaskSettingsSchema,
  type FashionTaskSettings,
} from "./task-settings";
import {
  PieceStreamError,
  PieceStreamParser,
  safeValidationIssues,
} from "./piece-stream";

const responseTextSchema = z.object({
  id: z.string().optional(),
  status: z.string(),
  incomplete_details: z
    .object({ reason: z.string().optional() })
    .nullable()
    .optional(),
  output: z.array(
    z.object({
      type: z.string(),
      content: z
        .array(z.object({ type: z.string(), text: z.string().optional() }))
        .optional(),
    }),
  ),
  usage: z
    .object({
      input_tokens: z.number().nonnegative(),
      output_tokens: z.number().nonnegative(),
      total_tokens: z.number().nonnegative(),
      input_tokens_details: z
        .object({ cached_tokens: z.number().nonnegative().optional() })
        .optional(),
      output_tokens_details: z
        .object({ reasoning_tokens: z.number().nonnegative().optional() })
        .optional(),
    })
    .optional(),
});

type ProviderUsage = z.infer<typeof responseTextSchema>["usage"];
type ProviderReceipt = {
  attempt: number;
  requestId: string | null;
  httpStatus: number | null;
  latencyMs: number;
  usage: ProviderUsage | null;
  responseStatus: string | null;
  providerCode: string | null;
  correctionAttempt: boolean;
};
const receiptSchema = z.object({
  id: z.string().optional(),
  status: z.string().optional(),
  usage: responseTextSchema.shape.usage,
});

function totalUsage(receipts: ProviderReceipt[]): ProviderUsage | null {
  if (!receipts.length || receipts.some((entry) => !entry.usage)) return null;
  return receipts.reduce(
    (sum, entry) => ({
      input_tokens: sum.input_tokens + entry.usage!.input_tokens,
      output_tokens: sum.output_tokens + entry.usage!.output_tokens,
      total_tokens: sum.total_tokens + entry.usage!.total_tokens,
    }),
    { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  );
}

export type FashionRequest<T extends z.ZodType> = {
  task: Exclude<FashionTask, "preview_image">;
  schema: T;
  context: unknown;
  imageDataUrl?: string;
  onPiece?: (piece: Garment, index: number) => Promise<void> | void;
  validate?: (data: z.output<T>) => void;
};

export type ProviderMetadata = {
  model: string;
  requestId: string | null;
  latencyMs: number;
  usage: ProviderUsage | null;
  promptVersion: string;
  knowledgeVersion: string;
  schemaVersion: string;
  promptSourceHash: string;
  knowledgeSourceHash: string;
  schemaSourceHash: string;
  promptAssemblyHash: string;
  attemptCount: number;
  operationId: string;
  correctionAttemptCount: number;
  providerSettings: FashionTaskSettings;
  slotReleaseFailed: boolean;
  requests: ProviderReceipt[];
  task: FashionRequest<z.ZodType>["task"];
};

type FashionOperationContext = {
  operationId: string;
  reserveCall: () => Promise<void>;
  releaseCall: () => Promise<void>;
  signal?: AbortSignal;
  deadline?: number;
  providerSettings?: FashionTaskSettings;
};
type ProviderFailureDetails = {
  code: string;
  retryable: boolean;
  httpStatus: number | null;
  providerCode: string | null;
  requestId: string | null;
  retryAfterMs: number | null;
  attemptCount: number;
  operationId: string | null;
  validationIssues: Array<{ code: string; path: string }>;
  responseStatus: string | null;
  incompleteReason: string | null;
  correctionAttempt: boolean;
  providerSettings: FashionTaskSettings | null;
  requests: ProviderReceipt[];
};
const operationScope = new AsyncLocalStorage<FashionOperationContext>();
const failures = new WeakMap<Error, ProviderFailureDetails>();
const workspaceSlots = new Map<
  string,
  { active: number; waiting: Array<() => void> }
>();

export function withFashionOperation<T>(
  context: FashionOperationContext,
  run: () => Promise<T>,
): Promise<T> {
  return operationScope.run(context, run);
}

export function safeProviderError(
  error: unknown,
): ProviderFailureDetails | null {
  if (!(error instanceof ApiError)) return null;
  return (
    failures.get(error) ?? {
      code: error.code,
      retryable: error.retryable,
      httpStatus: null,
      providerCode: null,
      requestId: null,
      retryAfterMs: null,
      attemptCount: 0,
      operationId: operationScope.getStore()?.operationId ?? null,
      validationIssues: [],
      responseStatus: null,
      incompleteReason: null,
      correctionAttempt: false,
      providerSettings: null,
      requests: [],
    }
  );
}

function diagnosticError(
  code: string,
  message: string,
  status: number,
  retryable: boolean,
  details: Partial<ProviderFailureDetails> = {},
) {
  const error = new ApiError(code, message, status, retryable);
  failures.set(error, {
    httpStatus: null,
    providerCode: null,
    requestId: null,
    retryAfterMs: null,
    attemptCount: 0,
    operationId: operationScope.getStore()?.operationId ?? null,
    validationIssues: [],
    responseStatus: null,
    incompleteReason: null,
    correctionAttempt: false,
    providerSettings: null,
    requests: [],
    ...details,
    code,
    retryable,
  });
  return error;
}

export function fashionValidationFailure(
  code: string,
  issues: Array<{ code: string; path: string }>,
) {
  return diagnosticError(
    code,
    "The recommendation did not pass validation. Review the input and retry.",
    502,
    false,
    {
      providerCode: "domain_validation",
      validationIssues: issues.slice(0, 12).map((issue) => ({
        code: safeIdentifier(issue.code) ?? "invalid_value",
        path: safeIdentifier(issue.path) ?? "output",
      })),
    },
  );
}

export function retryAfterMilliseconds(value: string | null, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.round(seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

function safeIdentifier(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9_.\[\]-]{1,200}$/.test(value)
    ? value
    : null;
}

async function acquireSlot(
  workspaceId: string,
  deadline: number,
): Promise<() => void> {
  let slots = workspaceSlots.get(workspaceId);
  if (!slots) {
    slots = { active: 0, waiting: [] };
    workspaceSlots.set(workspaceId, slots);
  }
  const state = slots;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const next = state.waiting.shift();
    if (next) next();
    else state.active--;
    if (state.active === 0 && state.waiting.length === 0)
      workspaceSlots.delete(workspaceId);
  };
  if (state.active < 3) {
    state.active++;
    return release;
  }
  const remaining = deadline - Date.now();
  if (remaining <= 0)
    throw diagnosticError(
      "provider_timeout",
      "Fashion analysis could not start in time. Retry the operation.",
      504,
      true,
    );
  return new Promise((resolve, reject) => {
    const grant = () => {
      clearTimeout(timer);
      resolve(release);
    };
    const timer = setTimeout(() => {
      const index = state.waiting.indexOf(grant);
      if (index !== -1) state.waiting.splice(index, 1);
      reject(
        diagnosticError(
          "provider_timeout",
          "Fashion analysis could not start in time. Retry the operation.",
          504,
          true,
        ),
      );
    }, remaining);
    state.waiting.push(grant);
  });
}

function invalidOutput(details: Partial<ProviderFailureDetails> = {}) {
  return diagnosticError(
    "provider_invalid_output",
    "The analysis returned incomplete or unsupported data. Review the input and retry.",
    502,
    false,
    details,
  );
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function permitsNull(value: unknown) {
  if (!object(value)) return false;
  return (
    value.type === "null" ||
    (Array.isArray(value.type) && value.type.includes("null")) ||
    (Array.isArray(value.anyOf) && value.anyOf.some(permitsNull))
  );
}

export function strictJsonSchema(schema: z.ZodType) {
  const source = z.toJSONSchema(schema, { target: "draft-7", io: "input" });
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(visit);
    if (!object(value)) return value;
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key !== "$schema") result[key] = visit(entry);
    }
    if (value.type === "object" || object(value.properties)) {
      const properties = object(value.properties) ? value.properties : {};
      if (
        Object.keys(properties).length === 0 &&
        object(value.additionalProperties)
      ) {
        throw new ApiError(
          "provider_unavailable",
          "The analysis schema is not configured for strict output.",
          503,
        );
      }
      const required = Array.isArray(value.required) ? value.required : [];
      result.properties = Object.fromEntries(
        Object.entries(properties).map(([key, entry]) => {
          const converted = visit(entry);
          return [
            key,
            required.includes(key) || permitsNull(converted)
              ? converted
              : { anyOf: [converted, { type: "null" }] },
          ];
        }),
      );
      result.required = Object.keys(properties);
      result.additionalProperties = false;
    }
    return result;
  }
  const result = visit(source);
  if (!object(result)) throw invalidOutput();
  return result;
}

export function parseFashionResponse<T extends z.ZodType>(
  schema: T,
  response: unknown,
): {
  data: z.output<T>;
  usage: ProviderUsage | null;
  responseId: string | null;
} {
  const parsed = responseTextSchema.safeParse(response);
  if (!parsed.success)
    throw invalidOutput({
      providerCode: "response_schema",
      validationIssues: safeValidationIssues(parsed.error.issues),
    });
  if (
    parsed.data.status === "incomplete" &&
    parsed.data.incomplete_details?.reason === "max_output_tokens"
  )
    throw diagnosticError(
      "provider_output_limit",
      "The analysis reached its output limit. Adjust the task settings or narrow the input before restarting.",
      502,
      false,
      {
        providerCode: "response_incomplete",
        responseStatus: "incomplete",
        incompleteReason: "max_output_tokens",
      },
    );
  if (parsed.data.status !== "completed")
    throw invalidOutput({
      providerCode: "response_incomplete",
      responseStatus: safeIdentifier(parsed.data.status),
      incompleteReason: safeIdentifier(parsed.data.incomplete_details?.reason),
    });
  const content = parsed.data.output.flatMap((entry) => entry.content ?? []);
  if (content.some((entry) => entry.type === "refusal")) {
    throw new ApiError(
      "provider_refused",
      "The provider could not analyze this reference. Try a different outfit image.",
      422,
    );
  }
  const text = content
    .filter((entry) => entry.type === "output_text")
    .map((entry) => entry.text ?? "")
    .join("");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw invalidOutput({
      providerCode: "invalid_json",
      responseStatus: "completed",
    });
  }
  const validated = schema.safeParse(value);
  if (!validated.success)
    throw invalidOutput({
      providerCode: "output_schema",
      responseStatus: "completed",
      validationIssues: safeValidationIssues(validated.error.issues),
    });
  return {
    data: validated.data,
    usage: parsed.data.usage ?? null,
    responseId: parsed.data.id ?? null,
  };
}

async function readStream<T extends z.ZodType>(
  response: Response,
  request: FashionRequest<T>,
  onResponse: (value: unknown) => void,
) {
  if (!response.body) throw invalidOutput();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = new PieceStreamParser();
  let pending = "";
  let completion: unknown;
  let emitted = 0;
  let totalBytes = 0;

  async function consume(frame: string) {
    const payload = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!payload || payload === "[DONE]") return;
    let event: unknown;
    try {
      event = JSON.parse(payload);
    } catch {
      throw invalidOutput({ providerCode: "invalid_event_json" });
    }
    if (!object(event) || typeof event.type !== "string") throw invalidOutput();
    if (
      event.type === "response.output_text.delta" &&
      typeof event.delta === "string"
    ) {
      for (const piece of parser.append(event.delta)) {
        await request.onPiece?.(piece, emitted++);
      }
    } else if (event.type === "response.completed") {
      completion = event.response;
      onResponse(completion);
    } else if (
      event.type === "response.refusal.delta" ||
      event.type === "response.refusal.done"
    ) {
      throw new ApiError(
        "provider_refused",
        "The provider could not analyze this reference. Try a different outfit image.",
        422,
      );
    } else if (
      ["response.failed", "response.incomplete"].includes(event.type)
    ) {
      onResponse(event.response);
      parseFashionResponse(request.schema, event.response);
      throw invalidOutput({ providerCode: "stream_failed" });
    } else if (event.type === "error") {
      throw invalidOutput({
        providerCode: safeIdentifier(event.code) ?? "stream_error",
      });
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > 8_000_000) throw invalidOutput();
      pending = (pending + decoder.decode(value, { stream: true })).replace(
        /\r\n/g,
        "\n",
      );
      let boundary: number;
      while ((boundary = pending.indexOf("\n\n")) !== -1) {
        await consume(pending.slice(0, boundary));
        pending = pending.slice(boundary + 2);
      }
    }
    pending += decoder.decode();
    if (pending.trim()) await consume(pending);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (!completion) throw invalidOutput({ providerCode: "stream_incomplete" });
  const result = parseFashionResponse(request.schema, completion);
  if (
    !object(result.data) ||
    !Array.isArray(result.data.pieces) ||
    emitted !== result.data.pieces.length
  ) {
    throw invalidOutput({ providerCode: "piece_count_mismatch" });
  }
  return result;
}

export async function requestFashion<T extends z.ZodType>(
  request: FashionRequest<T>,
): Promise<{ data: z.output<T>; metadata: ProviderMetadata }> {
  const scope = operationScope.getStore();
  if (!scope) {
    throw diagnosticError(
      "provider_unavailable",
      "Create a persisted analysis operation before starting the provider.",
      503,
      false,
      { providerCode: "operation_scope_missing" },
    );
  }
  const key =
    process.env.OPENAI_API_KEY?.trim() || process.env.MODEL_API_KEY?.trim();
  const settings = scope.providerSettings
    ? fashionTaskSettingsSchema.parse(scope.providerSettings)
    : getFashionTaskSettings(request.task);
  const model = settings.model;
  if (!key) {
    throw diagnosticError(
      "provider_unavailable",
      "Fashion analysis is not configured yet. Try again after setup.",
      503,
      false,
      { providerCode: "configuration_missing" },
    );
  }
  const context = JSON.stringify(request.context);
  if (
    typeof context !== "string" ||
    Buffer.byteLength(context, "utf8") > 300_000
  ) {
    throw diagnosticError(
      "provider_unavailable",
      "The analysis context is too large. Narrow the item selection and retry.",
      422,
      false,
      {
        providerCode: `context_bytes_${typeof context === "string" ? Buffer.byteLength(context, "utf8") : 0}`,
      },
    );
  }
  if (
    request.imageDataUrl &&
    !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(
      request.imageDataUrl,
    )
  ) {
    throw diagnosticError(
      "provider_unavailable",
      "The analysis image has not been verified.",
      422,
      false,
      { providerCode: "image_unverified" },
    );
  }
  const { instructions, versions } = buildFashionPrompt(request.task);
  const content: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: `<untrusted_context>\n${context}\n</untrusted_context>`,
    },
  ];
  if (request.imageDataUrl)
    content.push({
      type: "input_image",
      image_url: request.imageDataUrl,
      detail: "auto",
    });
  const requestBody = {
    model,
    instructions,
    input: [{ role: "user", content }],
    reasoning: { effort: settings.reasoningEffort },
    store: false,
    stream: Boolean(request.onPiece),
    max_output_tokens: settings.maxOutputTokens,
    text: {
      format: {
        type: "json_schema",
        name: request.task,
        strict: true,
        schema: strictJsonSchema(request.schema),
      },
    },
  };
  const started = Date.now();
  const deadline = Math.min(started + 240_000, scope.deadline ?? Infinity);
  const workspaceId = process.env.STYLORA_WORKSPACE_ID || "unconfigured";
  let provisionalOutput = false;
  const receipts: ProviderReceipt[] = [];
  let correction:
    | {
        type: "correction_attempt";
        code: string;
        issues: ProviderFailureDetails["validationIssues"];
      }
    | undefined;
  const streamingRequest = request.onPiece
    ? {
        ...request,
        onPiece: async (piece: Garment, index: number) => {
          provisionalOutput = true;
          await request.onPiece?.(piece, index);
        },
      }
    : request;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const releaseSlot = await acquireSlot(workspaceId, deadline);
    let reserved = false;
    let eligibleRetry = false;
    let failure: ApiError | undefined;
    let validatedResult:
      { data: z.output<T>; metadata: ProviderMetadata } | undefined;
    let slotReleaseFailed = false;
    let requestSent = false;
    let responseUsage: ProviderUsage | null = null;
    let responseStatus: string | null = null;
    const attemptStarted = Date.now();
    const recordEnvelope = (value: unknown) => {
      const parsed = receiptSchema.safeParse(value);
      if (parsed.success) {
        responseUsage = parsed.data.usage ?? null;
        responseStatus = safeIdentifier(parsed.data.status);
      }
    };
    let details: Partial<ProviderFailureDetails> = {
      attemptCount: attempt,
      operationId: scope.operationId,
      correctionAttempt: Boolean(correction),
    };
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      releaseSlot();
      throw diagnosticError(
        "provider_timeout",
        "Fashion analysis took too long. Retry the operation.",
        504,
        true,
        details,
      );
    }
    const timeout = AbortSignal.any([
      AbortSignal.timeout(Math.min(90_000, remaining)),
      ...(scope.signal ? [scope.signal] : []),
    ]);
    try {
      timeout.throwIfAborted();
      await scope.reserveCall();
      reserved = true;
      timeout.throwIfAborted();
      requestSent = true;
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...requestBody,
          input: [
            {
              role: "user",
              content: [
                ...content,
                ...(correction
                  ? [
                      {
                        type: "input_text",
                        text: `The previous response failed deterministic validation. Return a complete corrected response using the same supplied context and schema. Do not invent evidence or remove required information. Safe validation feedback: ${JSON.stringify(correction)}`,
                      },
                    ]
                  : []),
              ],
            },
          ],
        }),
        signal: timeout,
      });
      details = {
        ...details,
        httpStatus: response.status,
        requestId: safeIdentifier(response.headers.get("x-request-id")),
        retryAfterMs: retryAfterMilliseconds(
          response.headers.get("retry-after"),
        ),
      };
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const error =
          object(payload) && object(payload.error) ? payload.error : {};
        const providerCode =
          safeIdentifier(error.code) ?? safeIdentifier(error.type);
        details.providerCode = providerCode;
        eligibleRetry =
          (response.status === 429 || response.status >= 500) &&
          ![
            "insufficient_quota",
            "billing_hard_limit_reached",
            "model_not_found",
          ].includes(providerCode ?? "");
        throw diagnosticError(
          "provider_unavailable",
          eligibleRetry
            ? "Fashion analysis is temporarily unavailable. Retry shortly."
            : "The fashion provider could not accept this request. Check its configuration.",
          503,
          eligibleRetry,
          details,
        );
      }
      let result: ReturnType<typeof parseFashionResponse<T>>;
      if (request.onPiece)
        result = await readStream(response, streamingRequest, recordEnvelope);
      else {
        const envelope: unknown = await response.json();
        recordEnvelope(envelope);
        result = parseFashionResponse(request.schema, envelope);
      }
      request.validate?.(result.data);
      validatedResult = {
        data: result.data,
        metadata: {
          ...versions,
          task: request.task,
          model,
          requestId: details.requestId ?? result.responseId,
          latencyMs: Date.now() - started,
          usage: result.usage,
          attemptCount: attempt,
          operationId: scope.operationId,
          correctionAttemptCount: correction ? 1 : 0,
          providerSettings: settings,
          slotReleaseFailed: false,
          requests: [],
        },
      };
    } catch (error) {
      if (error instanceof ApiError) {
        failure = error;
      } else if (error instanceof PieceStreamError) {
        failure = invalidOutput({
          providerCode: error.reason,
          validationIssues: error.validationIssues,
        });
      } else if (error instanceof SyntaxError || error instanceof z.ZodError) {
        failure = invalidOutput({
          providerCode:
            error instanceof SyntaxError ? "invalid_json" : "output_schema",
          validationIssues:
            error instanceof z.ZodError
              ? safeValidationIssues(error.issues)
              : [],
        });
      } else if (timeout.aborted) {
        eligibleRetry = true;
        failure = diagnosticError(
          "provider_timeout",
          "Fashion analysis took too long. Retry the operation.",
          504,
          true,
          details,
        );
      } else if (error instanceof TypeError || error instanceof DOMException) {
        eligibleRetry = true;
        failure = diagnosticError(
          "provider_unavailable",
          "Fashion analysis could not connect. Retry shortly.",
          503,
          true,
          details,
        );
      } else {
        failure = diagnosticError(
          "provider_unavailable",
          "The analysis could not finish. Check its operation status.",
          502,
          false,
          details,
        );
      }
      const existing = safeProviderError(failure);
      failures.set(failure, {
        ...existing!,
        ...details,
        code: failure.code,
        retryable: failure.retryable,
      });
    } finally {
      if (requestSent)
        receipts.push({
          attempt,
          requestId: details.requestId ?? null,
          httpStatus: details.httpStatus ?? null,
          latencyMs: Date.now() - attemptStarted,
          usage: responseUsage,
          responseStatus,
          providerCode: failure
            ? (safeProviderError(failure)?.providerCode ?? null)
            : null,
          correctionAttempt: Boolean(correction),
        });
      try {
        if (reserved) {
          try {
            await scope.releaseCall();
          } catch {
            slotReleaseFailed = true;
          }
        }
      } finally {
        releaseSlot();
      }
    }
    if (validatedResult) {
      validatedResult.metadata.slotReleaseFailed = slotReleaseFailed;
      validatedResult.metadata.requests = [...receipts];
      validatedResult.metadata.usage = totalUsage(receipts);
      validatedResult.metadata.latencyMs = Date.now() - started;
      return validatedResult;
    }
    if (!failure) throw invalidOutput();
    failures.set(failure, {
      ...safeProviderError(failure)!,
      providerSettings: settings,
      requests: [...receipts],
    });
    if (slotReleaseFailed) throw failure;
    const validation = safeProviderError(failure);
    const correctable =
      validation?.providerCode === "domain_validation" ||
      (failure.code === "provider_invalid_output" &&
        ["output_schema", "invalid_json", "garment_schema"].includes(
          validation?.providerCode ?? "",
        ));
    if (
      !correction &&
      correctable &&
      !provisionalOutput &&
      !timeout.aborted &&
      attempt < 3
    ) {
      correction = {
        type: "correction_attempt",
        code: failure.code,
        issues: validation?.validationIssues ?? [],
      };
      continue;
    }
    if (details.correctionAttempt) throw failure;
    if (!eligibleRetry || provisionalOutput || scope.signal?.aborted)
      throw failure;
    if (attempt === 3) {
      throw diagnosticError(
        failure.code,
        failure.message,
        failure.status,
        false,
        { ...safeProviderError(failure)!, ...details },
      );
    }
    const delay =
      Math.max(details.retryAfterMs ?? 0, 500 * 2 ** (attempt - 1)) +
      Math.floor(Math.random() * 250);
    if (Date.now() + delay >= deadline) throw failure;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw invalidOutput();
}
