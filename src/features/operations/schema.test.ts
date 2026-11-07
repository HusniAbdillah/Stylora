import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/ai/openai", () => ({
  IMAGE_MODEL: "gpt-image-1.5",
  FASHION_PROMPT_VERSION: "stylora-fashion-v1",
  FASHION_SCHEMA_VERSION: "fashion-item.v1",
}));
vi.mock("@/features/preview/image", () => ({
  renderAndStoreAvatar: vi.fn(),
  discardPendingAvatar: vi.fn(),
}));

import { shouldReuseSavedAvatar } from "@/features/outfits/saved-avatar";
import { fingerprintOperationInput } from "./fingerprint";
import {
  operationRowSchema,
  operationStatus,
  startOperationSchema,
} from "./schema";

describe("operation identity and status", () => {
  it("uses stable object ordering while preserving ordered arrays", () => {
    const first = {
      selection: [{ id: "a", revision: 1 }],
      preferences: { fit: "relaxed", swatch: "depth_03" },
    };
    const reordered = {
      preferences: { swatch: "depth_03", fit: "relaxed" },
      selection: [{ revision: 1, id: "a" }],
    };
    expect(fingerprintOperationInput(first)).toBe(
      fingerprintOperationInput(reordered),
    );
    expect(fingerprintOperationInput(["a", "b"])).not.toBe(
      fingerprintOperationInput(["b", "a"]),
    );
    expect(fingerprintOperationInput(first)).not.toBe(
      fingerprintOperationInput({ ...first, revision: 2 }),
    );
  });

  it("rejects browser workspace overrides and non-JSON provider input", () => {
    const input = {
      kind: "preview_image",
      subjectType: "draft",
      subjectId: "d270f645-b0d9-4c6f-8593-a154f31b98c9",
      inputRevision: 1,
      inputFingerprint: "a".repeat(64),
      input: {},
      promptVersion: "stylora-fashion-v1",
      schemaVersion: "fashion-item.v1",
      model: "gpt-image-1.5",
    };
    expect(startOperationSchema.safeParse(input).success).toBe(true);
    expect(
      startOperationSchema.safeParse({ ...input, workspaceId: input.subjectId })
        .success,
    ).toBe(false);
    expect(() => fingerprintOperationInput({ value: Number.NaN })).toThrow();
  });

  it("exposes result references without operation inputs or private paths", () => {
    const operation = operationRowSchema.parse({
      id: "d270f645-b0d9-4c6f-8593-a154f31b98c9",
      workspace_id: "ae781e34-b315-44a5-abfe-0c6c074a49c8",
      kind: "preview_image",
      subject_type: "draft",
      subject_id: "d270f645-b0d9-4c6f-8593-a154f31b98c9",
      status: "succeeded",
      input_revision: 1,
      input_fingerprint: "a".repeat(64),
      input: { preferences: { skinSwatchId: "depth_03" } },
      attempt_count: 1,
      lease_until: null,
      result_ref: {
        assetId: "ae781e34-b315-44a5-abfe-0c6c074a49c8",
        storage_path: "private/path",
      },
      safe_error_code: null,
      cancel_requested_at: null,
      created_at: "2026-11-07T03:00:00+00:00",
      updated_at: "2026-11-07T03:00:00+00:00",
    });
    const response = operationStatus(operation);
    expect(response.resultRef).toEqual({
      assetId: "ae781e34-b315-44a5-abfe-0c6c074a49c8",
    });
    expect(response).not.toHaveProperty("input");
    expect(response).not.toHaveProperty("workspace_id");
  });
});

describe("saved avatar regeneration intent", () => {
  const requestId = "d270f645-b0d9-4c6f-8593-a154f31b98c9";

  it("keeps reuse for legacy operation inputs", () => {
    expect(shouldReuseSavedAvatar({})).toBe(true);
    expect(
      shouldReuseSavedAvatar({
        saved_look_id: requestId,
        preference_snapshot_hash: "a".repeat(64),
      }),
    ).toBe(true);
  });

  it("disables reuse for an explicit regeneration with a request ID", () => {
    expect(shouldReuseSavedAvatar({ intent: "regenerate", requestId })).toBe(
      false,
    );
  });

  it.each([
    { intent: "regenerate" },
    { intent: "regenerate", requestId: "invalid" },
    { intent: "initial", requestId },
  ])("rejects invalid regeneration identity %#", (input) => {
    expect(() => shouldReuseSavedAvatar(input)).toThrow();
  });
});
