import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));

import { assertSingleProvisionalSource, parseProvisionalAdoption, toCanonicalPiece } from "./server";

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
  it("rejects adopting pieces from different analysis operations in one batch", () => {
    const first = "29b19ded-f307-4f53-bdc8-cbfaab1b3fc7";
    const second = "77de3f09-9ded-49c1-97ca-d4096b8b0ca5";
    expect(() => assertSingleProvisionalSource([{ operationId: first }, { operationId: first }])).not.toThrow();
    expect(() => assertSingleProvisionalSource([{ operationId: first }, { operationId: second }]))
      .toThrow(expect.objectContaining({ code: "provisional_analysis_conflict", status: 409 }));
  });
  it("adopts only complete evidence from the current workspace, source, look and failed operation", () => {
    const operationId = "29b19ded-f307-4f53-bdc8-cbfaab1b3fc7";
    const assetId = "04a3581d-21e8-48e0-a217-7bdc39b92087";
    const evidence = { source: "visual_inference", state: "observed", confidence: 0.8,
      evidence: "Visible loose fabric through the torso.", uncertainty: null };
    const piece = { id: row.id, name: "Shirt", category: "top", subcategory: null,
      description: "A loose shirt.", attributes: { fit: "relaxed" },
      observations: ["name", "category", "description", "attributes.fit"].map((path) => ({ path, ...evidence })),
      confidence: 0.8, uncertainty: [] };
    const operation = { id: operationId, workspace_id: row.workspace_id,
      kind: "inspiration_description", subject_type: "look", subject_id: row.look_id,
      status: "failed", input_revision: 2, model: "test-model",
      input: { lookId: row.look_id, lookRevision: 2, assetId } };
    const event = { workspace_id: row.workspace_id, operation_id: operationId,
      source_revision: 2, event_type: "piece_completed", payload: { piece } };
    const input = { workspaceId: row.workspace_id, lookId: row.look_id, revision: 2,
      assetId, operation, event };
    expect(parseProvisionalAdoption(input).provenance["attributes.fit"]).toMatchObject({
      source: "visual_inference", assetId, model: "test-model", evidence: evidence.evidence });
    expect(() => parseProvisionalAdoption({ ...input, workspaceId: row.look_id })).toThrow();
    expect(() => parseProvisionalAdoption({ ...input, revision: 3 })).toThrow();
    expect(() => parseProvisionalAdoption({ ...input, operation: { ...operation, subject_id: row.id } })).toThrow();
    expect(() => parseProvisionalAdoption({ ...input, operation: { ...operation, status: "running" } })).toThrow();
    expect(() => parseProvisionalAdoption({ ...input, event: { ...event,
      payload: { piece: { ...piece, observations: [] } } } })).toThrow();
  });
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
