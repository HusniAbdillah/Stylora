import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  parseFashionResponse,
  requestFashion,
  retryAfterMilliseconds,
  safeProviderError,
  strictJsonSchema,
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
      providerCode: null,
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
