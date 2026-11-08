import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("server-only", () => ({}));
import { buildFashionPrompt } from "@/prompts/fashion";
import { OperationError } from "@/features/operations/errors";
import { capsuleGenerationConfig } from "@/features/capsules/generation-context";
import {
  capsuleFixtureBrief as brief,
  capsuleFixtureItems as items,
  capsuleOutputFixture,
} from "@/features/capsules/generation-fixtures";
import {
  capsuleProviderSchema,
  validateCapsuleGeneration,
} from "@/features/capsules/generation-schema";
import {
  CAPSULE_PROMPT_VERSION,
  generateFashionJson,
  parseFashionJsonOutput,
} from "./openai";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const context = {
  brief,
  items,
  allowedSignals: ["Owned wardrobe"],
  preferences: {},
};
const request = () => ({
  task: "capsule" as const,
  context,
  config: capsuleGenerationConfig("gpt-5-mini", 3),
  schema: z.toJSONSchema(
    capsuleProviderSchema(brief, items, context.allowedSignals),
  ),
  validate: (value: unknown) =>
    validateCapsuleGeneration(value, brief, items, context.allowedSignals),
});
function completed(value: unknown) {
  return {
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(value) }],
      },
    ],
  };
}
function intercept() {
  vi.stubEnv("OPENAI_API_KEY", "fixture-api-key");
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Capsule provider protocol", () => {
  it("retains full fashion instructions and captures bounded low reasoning policy", async () => {
    const fetchMock = intercept().mockResolvedValue(
      Response.json(completed(capsuleOutputFixture())),
    );
    const response = await generateFashionJson(request());
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.instructions).toContain(
      buildFashionPrompt("capsule_generation").instructions,
    );
    expect(body.model).toBe("gpt-5-mini");
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.max_output_tokens).toBe(6000);
    expect(body.text.verbosity).toBe("low");
    expect(body.text.format.strict).toBe(true);
    expect(JSON.parse(body.input)).toEqual(context);
    expect(response).toMatchObject({
      promptVersion: CAPSULE_PROMPT_VERSION,
      providerAttempts: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("makes one validated correction in exactly the captured context without raw output feedback", async () => {
    const invalid = capsuleOutputFixture();
    invalid.outfits[0].itemIds[0] = "20000000-0000-4000-8000-000000000001";
    const fetchMock = intercept()
      .mockResolvedValueOnce(Response.json(completed(invalid)))
      .mockResolvedValueOnce(Response.json(completed(capsuleOutputFixture())));
    const beforeCorrection = vi.fn().mockResolvedValue(undefined);
    const result = await generateFashionJson({
      ...request(),
      beforeCorrection,
    });
    expect(result.providerAttempts).toBe(2);
    expect(beforeCorrection).toHaveBeenCalledTimes(1);
    const correction = JSON.parse(
      JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).input,
    );
    expect(correction.context).toEqual(context);
    expect(correction.validationFeedback).toMatchObject({
      code: "CAPSULE_REFERENCE_INVALID",
      diagnostics: [
        { code: "CAPSULE_REFERENCE_INVALID", path: "outfits[0].itemIds[0]" },
      ],
    });
    expect(JSON.stringify(correction)).not.toContain(
      invalid.outfits[0].itemIds[0],
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("reserves each HTTP request before sending and aggregates safe correction usage", async () => {
    const order: string[] = [];
    const usage = {
      input_tokens: 100,
      output_tokens: 30,
      total_tokens: 130,
      input_tokens_details: { cached_tokens: 12 },
      output_tokens_details: { reasoning_tokens: 3 },
    };
    const fetchMock = intercept()
      .mockImplementationOnce(async () => {
        order.push("http1");
        return Response.json(
          { ...completed({ outfits: [] }), usage },
          { headers: { "x-request-id": "req_first" } },
        );
      })
      .mockImplementationOnce(async () => {
        order.push("http2");
        return Response.json(
          {
            ...completed(capsuleOutputFixture()),
            usage: { input_tokens: 80, output_tokens: 40, total_tokens: 120 },
          },
          { headers: { "x-request-id": "req_second" } },
        );
      });
    const onProviderMetadata = vi.fn().mockResolvedValue(undefined);
    const result = await generateFashionJson({
      ...request(),
      beforeRequest: async (attempt) => {
        order.push(`reserve${attempt}`);
      },
      onProviderMetadata,
    });
    expect(order).toEqual(["reserve1", "http1", "reserve2", "http2"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.providerMetadata).toMatchObject({
      providerAttempts: 2,
      usage: { input_tokens: 180, output_tokens: 70, total_tokens: 250 },
      requests: [
        { attempt: 1, requestId: "req_first", usage },
        { attempt: 2, requestId: "req_second", responseStatus: "completed" },
      ],
    });
    expect(onProviderMetadata).toHaveBeenLastCalledWith({
      ...result.providerMetadata,
      latencyMs: expect.any(Number),
    });
    expect(result.providerMetadata.latencyMs).toBeGreaterThanOrEqual(0);
  });
  it("sends no HTTP request when reservation fails", async () => {
    const fetchMock = intercept();
    const beforeRequest = vi
      .fn()
      .mockRejectedValue(
        new OperationError(
          "CAPSULE_PROVIDER_BUDGET_EXHAUSTED",
          "Request limit reached.",
          429,
        ),
      );
    await expect(
      generateFashionJson({ ...request(), beforeRequest }),
    ).rejects.toMatchObject({
      code: "CAPSULE_PROVIDER_BUDGET_EXHAUSTED",
      providerAttempts: 0,
      providerMetadata: { providerAttempts: 0, requests: [], usage: null },
    });
    expect(beforeRequest).toHaveBeenCalledExactlyOnceWith(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not reserve unconfigured requests", async () => {
    const fetchMock = intercept();
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("MODEL_API_KEY", "");
    const beforeRequest = vi.fn().mockResolvedValue(undefined);
    await expect(
      generateFashionJson({ ...request(), beforeRequest }),
    ).rejects.toMatchObject({
      code: "OPENAI_UNCONFIGURED",
      providerAttempts: 0,
    });
    expect(beforeRequest).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("records a reserved network failure with unknown usage without another request", async () => {
    const fetchMock = intercept().mockRejectedValue(new TypeError("Offline."));
    const beforeRequest = vi.fn().mockResolvedValue(undefined);
    const onProviderMetadata = vi.fn().mockResolvedValue(undefined);
    await expect(
      generateFashionJson({ ...request(), beforeRequest, onProviderMetadata }),
    ).rejects.toMatchObject({
      code: "OPENAI_CONNECTION_FAILED",
      providerAttempts: 1,
      providerMetadata: {
        providerAttempts: 1,
        usage: null,
        requests: [
          {
            attempt: 1,
            requestId: null,
            responseStatus: "request_failed",
            usage: null,
          },
        ],
      },
    });
    expect(beforeRequest).toHaveBeenCalledExactlyOnceWith(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onProviderMetadata).toHaveBeenCalledTimes(1);
  });
  it("ignores invalid request IDs and private usage extensions", async () => {
    intercept().mockResolvedValue(
      Response.json(
        {
          ...completed(capsuleOutputFixture()),
          usage: {
            input_tokens: 1,
            output_tokens: 2,
            total_tokens: 3,
            private_extension: "Private generated details.",
          },
        },
        {
          headers: { "x-request-id": "https://private.invalid/signed?token=x" },
        },
      ),
    );
    const result = await generateFashionJson(request());
    expect(result.providerRequestId).toBeNull();
    expect(result.providerMetadata.requests[0].requestId).toBeNull();
    expect(JSON.stringify(result.providerMetadata)).not.toContain("private");
  });
  it("stops after two invalid results and does not replace unknown IDs", async () => {
    const invalid = capsuleOutputFixture();
    invalid.outfits[0].itemIds[0] = "20000000-0000-4000-8000-000000000001";
    const fetchMock = intercept().mockImplementation(async () =>
      Response.json(completed(invalid)),
    );
    await expect(generateFashionJson(request())).rejects.toMatchObject({
      code: "CAPSULE_REFERENCE_INVALID",
      retryable: false,
      providerAttempts: 2,
    });
    expect(invalid.outfits[0].itemIds[0]).toBe(
      "20000000-0000-4000-8000-000000000001",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("verifies captured dependencies before paying for a correction", async () => {
    const invalid = capsuleOutputFixture();
    invalid.outfits[0].inputsUsed = ["Invented preference"];
    const fetchMock = intercept().mockResolvedValue(
      Response.json(completed(invalid)),
    );
    await expect(
      generateFashionJson({
        ...request(),
        beforeCorrection: async () => {
          throw new OperationError(
            "CAPSULE_SUPERSEDED",
            "Inputs changed.",
            409,
          );
        },
      }),
    ).rejects.toMatchObject({ code: "CAPSULE_SUPERSEDED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    [
      "refusal",
      {
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "refusal", refusal: "Private refusal text." }],
          },
        ],
      },
      "OPENAI_RESPONSE_REFUSED",
    ],
    [
      "truncation",
      {
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [],
      },
      "OPENAI_OUTPUT_TRUNCATED",
    ],
    ["empty", { status: "completed", output: [] }, "OPENAI_OUTPUT_EMPTY"],
    [
      "malformed envelope",
      { status: "completed" },
      "OPENAI_RESPONSE_SCHEMA_INVALID",
    ],
    [
      "malformed JSON",
      {
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "not JSON" }],
          },
        ],
      },
      "OPENAI_OUTPUT_JSON_INVALID",
    ],
  ])("does not correct %s", async (_name, output, code) => {
    const fetchMock = intercept().mockResolvedValue(Response.json(output));
    await expect(generateFashionJson(request())).rejects.toMatchObject({
      code,
      retryable: false,
      providerAttempts: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not stack correction and transport retries", async () => {
    const fetchMock = intercept().mockRejectedValue(
      new TypeError("Network unavailable."),
    );
    await expect(generateFashionJson(request())).rejects.toMatchObject({
      code: "OPENAI_CONNECTION_FAILED",
      providerAttempts: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock
      .mockReset()
      .mockResolvedValueOnce(Response.json(completed({ outfits: [] })))
      .mockRejectedValue(new TypeError("Network unavailable."));
    await expect(generateFashionJson(request())).rejects.toMatchObject({
      code: "OPENAI_CONNECTION_FAILED",
      providerAttempts: 2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([
    ["server_error", "PROVIDER_SERVER_ERROR"],
    ["rate_limit_exceeded", "PROVIDER_RATE_LIMITED"],
  ])(
    "classifies a failed %s response without a correction request",
    async (code, expected) => {
      const fetchMock = intercept().mockResolvedValue(
        Response.json(
          {
            status: "failed",
            error: { code, message: "Private provider details." },
            output: [],
          },
          { headers: { "x-request-id": "req_failed_fixture" } },
        ),
      );
      const beforeRequest = vi.fn().mockResolvedValue(undefined);
      const afterRequest = vi.fn().mockResolvedValue(undefined);
      const beforeCorrection = vi.fn();
      await expect(
        generateFashionJson({
          ...request(),
          beforeRequest,
          afterRequest,
          beforeCorrection,
        }),
      ).rejects.toMatchObject({
        code: expected,
        retryable: true,
        diagnostics: [{ code: expected, path: "error.code" }],
        providerAttempts: 1,
        providerMetadata: {
          providerAttempts: 1,
          requests: [
            { requestId: "req_failed_fixture", responseStatus: "failed" },
          ],
        },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(beforeRequest).toHaveBeenCalledExactlyOnceWith(1);
      expect(afterRequest).toHaveBeenCalledTimes(1);
      expect(beforeCorrection).not.toHaveBeenCalled();
    },
  );
  it.each(["invalid_prompt", "insufficient_quota", "Private failure value"])(
    "keeps failed %s responses terminal and sanitized",
    async (code) => {
      const fetchMock = intercept().mockResolvedValue(
        Response.json({
          status: "failed",
          error: { code, message: "Private provider details." },
          output: [],
        }),
      );
      const failure = await generateFashionJson(request()).catch(
        (error: unknown) => error,
      );
      expect(failure).toMatchObject({
        code: "OPENAI_RESPONSE_FAILED",
        retryable: false,
        providerAttempts: 1,
      });
      expect(JSON.stringify(failure)).not.toContain("Private");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it("includes provider reservation time in the request deadline", async () => {
    const fetchMock = intercept();
    const start = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(start);
    try {
      await expect(
        generateFashionJson({
          ...request(),
          beforeRequest: async () => {
            now.mockReturnValue(start + 100001);
          },
        }),
      ).rejects.toMatchObject({ code: "OPENAI_DEADLINE_EXCEEDED" });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
    }
  });
  it.each([
    ["insufficient_quota", "OPENAI_QUOTA_EXHAUSTED", false],
    ["rate_limit_exceeded", "OPENAI_HTTP_429", true],
  ] as const)(
    "distinguishes HTTP429 %s without exposing its body",
    async (code, expectedCode, retryable) => {
      const fetchMock = intercept().mockResolvedValue(
        Response.json(
          { error: { code, message: "Private billing or request details." } },
          {
            status: 429,
            headers: {
              "x-request-id": "req_limit_fixture",
              "retry-after": "30",
            },
          },
        ),
      );
      const failure = await generateFashionJson(request()).catch(
        (error: unknown) => error,
      );
      expect(failure).toMatchObject({
        code: expectedCode,
        retryable,
        providerAttempts: 1,
        providerRequestId: "req_limit_fixture",
        providerMetadata: { providerAttempts: 1 },
        diagnostics: [
          {
            code: retryable ? "HTTP_429" : "INSUFFICIENT_QUOTA",
            path: retryable ? "response" : "error.code",
          },
        ],
      });
      expect(failure).toHaveProperty(
        "retryAfterSeconds",
        retryable ? 30 : undefined,
      );
      expect(JSON.stringify(failure)).not.toContain("Private");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it("keeps legacy jobs on their original single-request settings", async () => {
    const fetchMock = intercept().mockResolvedValue(
      Response.json(completed({ outfits: [] })),
    );
    await expect(
      generateFashionJson({ ...request(), legacy: true }),
    ).rejects.toMatchObject({
      code: "CAPSULE_SCHEMA_INVALID",
      providerAttempts: 1,
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.max_output_tokens).toBe(10000);
    expect(body.reasoning).toBeUndefined();
    expect(body.instructions).toBe(
      buildFashionPrompt("capsule_generation").instructions,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not expose arbitrary validation exception text", () => {
    try {
      parseFashionJsonOutput(completed({}), () => {
        throw new Error("Private generated details.");
      });
      throw new Error("Expected rejection.");
    } catch (error) {
      expect(error).toMatchObject({
        code: "OPENAI_VALIDATION_FAILED",
        diagnostics: [{ code: "VALIDATION_FAILED", path: "output" }],
      });
      expect(JSON.stringify(error)).not.toContain("Private generated details.");
    }
  });
});
