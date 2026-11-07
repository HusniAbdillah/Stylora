import { describe, expect, it, vi } from "vitest";
import { strictJsonSchema } from "@/lib/ai/provider";
import { createEvidenceProjection } from "@/features/matching/evidence";
import { outfitOptionsSchema } from "./schema";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

describe("outfit provider schema", () => {
  it("serializes the full outfit schema with projected evidence before inference", () => {
    const evidence = createEvidenceProjection({
      pieces: [
        {
          id: "b2574e91-24d9-4b02-a086-06d3703bce58",
          name: "Ivory shirt",
          category: "top",
          subcategory: "shirt",
          attributes: { primaryColor: "ivory" },
          sourceType: "live",
          revision: 1,
        },
      ],
      inventory: [],
      preferences: {},
      occasion: "Work",
      sourceRevision: 1,
    });
    const schema = outfitOptionsSchema.extend({
      options: outfitOptionsSchema.shape.options.element
        .extend({ explanation: evidence.schema })
        .array()
        .min(1)
        .max(3),
    });
    const wire = strictJsonSchema(schema);
    expect(wire).toMatchObject({
      type: "object",
      required: ["options"],
      additionalProperties: false,
    });
  });
});
