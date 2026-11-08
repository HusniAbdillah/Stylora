import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  parseFashionResponse,
  requestFashion,
  retryAfterMilliseconds,
  safeProviderError,
  strictJsonSchema,
  withFashionOperation,
  fashionValidationFailure,
} from "./provider";
import { descriptionSchema } from "./fashion-schema";

vi.mock("server-only", () => ({}));
vi.mock("../api", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public code: string,
      message: string,
      public status = 400,
      public retryable = false,
    ) {
      super(message);
    }
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const completed = (data: unknown) =>
  new Response(
    JSON.stringify({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(data) }],
        },
      ],
    }),
    { headers: { "Content-Type": "application/json" } },
  );

describe("accounted validation correction", () => {
  function setup(responses: Response[]) {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-key");
    vi.stubEnv("OPENAI_MODEL", "unit-test-model");
    const fetch = vi.fn();
    for (const response of responses) fetch.mockResolvedValueOnce(response);
    vi.stubGlobal("fetch", fetch);
    const context = {
      operationId: "unit-operation",
      reserveCall: vi.fn(async () => {}),
      releaseCall: vi.fn(async () => {}),
    };
    return { fetch, context };
  }
  it("makes one correction from the same context, with safe validation paths and two reservations", async () => {
    const { fetch, context } = setup([
      completed({ count: "private-output-do-not-repeat" }),
      completed({ count: 2 }),
    ]);
    const result = await withFashionOperation(context, () =>
      requestFashion({
        task: "outfit_options",
        schema: z.strictObject({ count: z.number().positive() }),
        context: { sourceRevision: 1 },
      }),
    );
    expect(result.data).toEqual({ count: 2 });
    expect(result.metadata).toMatchObject({
      attemptCount: 2,
      correctionAttemptCount: 1,
    });
    expect(context.reserveCall).toHaveBeenCalledTimes(2);
    expect(context.releaseCall).toHaveBeenCalledTimes(2);
    const first = JSON.parse(fetch.mock.calls[0][1].body);
    const second = JSON.parse(fetch.mock.calls[1][1].body);
    expect(second.input[0].content[0]).toEqual(first.input[0].content[0]);
    expect(second.input[0].content[1].text).toContain("correction_attempt");
    expect(second.input[0].content[1].text).toContain('"path":"count"');
    expect(second.input[0].content[1].text).not.toContain(
      "private-output-do-not-repeat",
    );
  });
  it("corrects deterministic domain failures once without relaxing the validator", async () => {
    const { fetch, context } = setup([
      completed({ count: 1 }),
      completed({ count: 2 }),
    ]);
    const result = await withFashionOperation(context, () =>
      requestFashion({
        task: "outfit_options",
        schema: z.object({ count: z.number() }),
        context: {},
        validate: (data) => {
          if (data.count !== 2)
            throw fashionValidationFailure("invalid_outfit_composition", [
              { code: "incomplete_clothing_coverage", path: "options" },
            ]);
        },
      }),
    );
    expect(result.data.count).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not issue a third request when the correction remains invalid", async () => {
    const { fetch, context } = setup([
      completed({ count: -1 }),
      completed({ count: -2 }),
      completed({ count: 2 }),
    ]);
    const failure = await withFashionOperation(context, () =>
      requestFashion({
        task: "outfit_options",
        schema: z.object({ count: z.number().positive() }),
        context: {},
      }),
    ).catch((error: unknown) => error);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(safeProviderError(failure)).toMatchObject({
      code: "provider_invalid_output",
      correctionAttempt: true,
      retryable: false,
    });
  });
  it("keeps refusal terminal without a corrective request", async () => {
    const { fetch, context } = setup([
      new Response(
        JSON.stringify({
          status: "completed",
          output: [{ type: "message", content: [{ type: "refusal" }] }],
        }),
      ),
    ]);
    await expect(
      withFashionOperation(context, () =>
        requestFashion({
          task: "inspiration_confidence",
          schema: z.object({ count: z.number() }),
          context: {},
        }),
      ),
    ).rejects.toMatchObject({ code: "provider_refused" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("uses captured controls and preserves a valid response when releasing quota fails", async () => {
    const { fetch, context } = setup([completed({ count: 2 })]);
    context.releaseCall.mockRejectedValueOnce(
      new Error("synthetic release failure"),
    );
    vi.stubEnv("OPENAI_TEXT_MODEL", "new-live-model");
    const providerSettings = {
      version: "fashion-request.v1" as const,
      model: "captured-model",
      reasoningEffort: "none" as const,
      maxOutputTokens: 16000,
    };
    const result = await withFashionOperation(
      { ...context, providerSettings },
      () =>
        requestFashion({
          task: "outfit_options",
          schema: z.object({ count: z.number() }),
          context: {},
        }),
    );
    expect(result).toMatchObject({
      data: { count: 2 },
      metadata: { providerSettings, slotReleaseFailed: true },
    });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      model: "captured-model",
      max_output_tokens: 16000,
      reasoning: { effort: "none" },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("reports output exhaustion without automatically paying for the same capped request again", async () => {
    const { fetch, context } = setup([
      new Response(
        JSON.stringify({
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output: [],
        }),
      ),
    ]);
    await expect(
      withFashionOperation(context, () =>
        requestFashion({
          task: "outfit_options",
          schema: z.object({ count: z.number() }),
          context: {},
        }),
      ),
    ).rejects.toMatchObject({
      code: "provider_output_limit",
      retryable: false,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("stops before accounting or inference when the shared deadline is exhausted", async () => {
    const { fetch, context } = setup([]);
    await expect(
      withFashionOperation({ ...context, deadline: Date.now() - 1 }, () =>
        requestFashion({
          task: "outfit_options",
          schema: z.object({ count: z.number() }),
          context: {},
        }),
      ),
    ).rejects.toMatchObject({ code: "provider_timeout" });
    expect(fetch).not.toHaveBeenCalled();
    expect(context.reserveCall).not.toHaveBeenCalled();
  });
  it("never corrects a stream after a complete provisional piece has been published", async () => {
    const evidence = {
      source: "visual_inference",
      state: "observed",
      confidence: 0.8,
      evidence: "Visible in the supplied fixture image.",
      uncertainty: null,
    };
    const piece = {
      name: "Fixture shirt",
      category: "top",
      subcategory: null,
      description: "A visible shirt.",
      coreEvidence: {
        name: evidence,
        category: evidence,
        subcategory: evidence,
        description: evidence,
      },
      attributes: [],
      confidence: 0.8,
      uncertainty: [],
    };
    const delta = JSON.stringify({ pieces: [piece] });
    const stream = `data: ${JSON.stringify({ type: "response.output_text.delta", delta })}\n\ndata: ${JSON.stringify({ type: "response.completed", response: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"pieces":[]}' }] }] } })}\n\n`;
    const { fetch, context } = setup([new Response(stream)]);
    const onPiece = vi.fn();
    await expect(
      withFashionOperation(context, () =>
        requestFashion({
          task: "inspiration_description",
          schema: descriptionSchema,
          context: {},
          onPiece,
        }),
      ),
    ).rejects.toMatchObject({ code: "provider_invalid_output" });
    expect(onPiece).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("provider wire validation", () => {
  it("reports validation paths and incomplete reasons without provider values", () => {
    const schema = z.strictObject({ count: z.number() });
    let invalid: unknown;
    try {
      parseFashionResponse(schema, {
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: '{"count":"do-not-log-provider-value"}',
              },
            ],
          },
        ],
      });
    } catch (error) {
      invalid = error;
    }
    const details = safeProviderError(invalid);
    expect(details).toMatchObject({
      providerCode: "output_schema",
      validationIssues: [{ code: "invalid_type", path: "count" }],
    });
    expect(JSON.stringify(details)).not.toContain("do-not-log-provider-value");
    let incomplete: unknown;
    try {
      parseFashionResponse(schema, {
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [],
      });
    } catch (error) {
      incomplete = error;
    }
    expect(safeProviderError(incomplete)).toMatchObject({
      responseStatus: "incomplete",
      incompleteReason: "max_output_tokens",
    });
  });

  it("honors numeric and HTTP-date Retry-After values", () => {
    expect(retryAfterMilliseconds("2.5", 0)).toBe(2500);
    expect(retryAfterMilliseconds("Thu, 01 Jan 1970 00:00:02 GMT", 500)).toBe(
      1500,
    );
    expect(retryAfterMilliseconds("invalid", 0)).toBeNull();
  });

  it("blocks inference without persisted-operation accounting", async () => {
    const failure = await requestFashion({
      task: "inspiration_confidence",
      schema: z.strictObject({ count: z.number() }),
      context: {},
    }).catch((error: unknown) => error);
    expect(safeProviderError(failure)).toMatchObject({
      code: "provider_unavailable",
      retryable: false,
      attemptCount: 0,
      providerCode: "operation_scope_missing",
    });
  });

  it("produces a strict provider schema for the complete canonical description", () => {
    const schema = strictJsonSchema(descriptionSchema);
    const wire = JSON.stringify(schema);
    expect(schema.required).toEqual(["pieces"]);
    expect(wire).toContain('"apparentMaterial"');
    expect(wire).toContain('"activitySpecialization"');
    expect(wire).toContain('"additionalProperties":false');
    expect(wire).not.toContain('"$schema"');
  });

  it("converts optional fields to required nullable fields for strict structured output", () => {
    const schema = strictJsonSchema(
      z.strictObject({
        selected: z.string().optional(),
        nested: z.strictObject({ count: z.number() }),
      }),
    );
    expect(schema.required).toEqual(["selected", "nested"]);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties).toMatchObject({
      selected: { anyOf: [{ type: "string" }, { type: "null" }] },
      nested: { required: ["count"], additionalProperties: false },
    });
  });

  it("rejects malformed output, incomplete responses and refusals", () => {
    const schema = z.strictObject({ count: z.number().int().positive() });
    const completed = {
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: '{"count":-1}' }],
        },
      ],
    };
    expect(() => parseFashionResponse(schema, completed)).toThrow();
    expect(() =>
      parseFashionResponse(schema, { ...completed, status: "incomplete" }),
    ).toThrow();
    expect(() =>
      parseFashionResponse(schema, {
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "refusal", refusal: "refused" }],
          },
        ],
      }),
    ).toThrow();
    expect(
      parseFashionResponse(schema, {
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: '{"count":2}' }],
          },
        ],
      }).data,
    ).toEqual({ count: 2 });
  });
});
