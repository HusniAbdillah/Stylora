import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));

import { toCanonicalPiece } from "./server";

const row: Database["public"]["Tables"]["inspiration_pieces"]["Row"] = {
  id: "9f07a623-e31c-48e0-9ebe-a0af5414fccb",
  workspace_id: "cccf56bf-ac67-417e-bef1-f43dc6a87aa1",
  look_id: "0d53751e-c033-4588-9eca-64c8a974bc6b",
  name: "Navy shirt",
  category: "top",
  subcategory: "shirt",
  description: "A navy shirt with a pointed collar.",
  attributes: { primaryColor: "navy", collar: "pointed" },
  confidence: 0.7,
  corrections: {
    "attributes.primaryColor": {
      originalValue: "blue",
      previousValue: "blue",
      value: "navy",
      source: "user",
      revision: 2,
    },
  },
  provenance: {
    "attributes.primaryColor": {
      source: "visual_inference",
      state: "observed",
      confidence: 0.7,
      evidence: "The visible fabric appears blue.",
      uncertainty: "Lighting may alter the color.",
      assetId: "04a3581d-21e8-48e0-a217-7bdc39b92087",
      provider: "openai",
      model: "gpt-6-luna",
    },
  },
  uncertainty: ["Fiber composition is unknown."],
  position: 0,
  revision: 2,
  source_type: "live",
  image_context: {},
  removed_at: null,
  created_at: "2026-11-07T04:00:00Z",
  updated_at: "2026-11-07T04:00:00Z",
};

describe("inspiration persistence adapter", () => {
  it("keeps the corrected effective value and original visual evidence distinct", () => {
    const piece = toCanonicalPiece(row, "04a3581d-21e8-48e0-a217-7bdc39b92087");
    expect(piece.attributes.primaryColor).toBe("navy");
    expect(piece.corrections["attributes.primaryColor"]).toMatchObject({
      originalValue: "blue",
      value: "navy",
      source: "user",
    });
    expect(piece.observations[0]).toMatchObject({
      source: "visual_inference",
      evidence: "The visible fabric appears blue.",
    });
    expect(piece).not.toHaveProperty("workspace_id");
    expect(piece).not.toHaveProperty("look_id");
    expect(piece.schemaVersion).toBe("fashion-item.v1");
  });

  it("rejects malformed provenance and category-incompatible stored attributes", () => {
    expect(() =>
      toCanonicalPiece({ ...row, provenance: { color: "blue" } }, null),
    ).toThrow();
    expect(() =>
      toCanonicalPiece({ ...row, attributes: { shoeType: "cleats" } }, null),
    ).toThrow();
  });
});
