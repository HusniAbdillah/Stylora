import { describe, expect, it } from "vitest";
import {
  CREATE_RUNTIME_VERSION,
  createInputSnapshot,
  createOperationFingerprint,
  createOperationPolicy,
  matchesCoverCurrentInput,
} from "./create-policy";

const assetId = "ad77a8cf-c749-48b1-b463-d21dd65ab503";
const operation = {
  input: { assetId, runtimeVersion: CREATE_RUNTIME_VERSION },
  status: "failed",
  input_fingerprint: "current",
  attempt_count: 1,
  provider_call_count: 1,
  result_ref: { retryable: true },
};

describe("Create operation recovery policy", () => {
  it("requires one committed match per piece for the exact inventory and preferences", () => {
    const expected = {
      inventoryMode: "combined" as const,
      inventoryFingerprint: "inventory",
      preferenceFingerprint: "preferences",
    };
    const row = { piece_id: assetId, input_metadata: expected };
    expect(matchesCoverCurrentInput([row], [assetId], expected)).toBe(true);
    expect(matchesCoverCurrentInput([], [assetId], expected)).toBe(false);
    expect(
      matchesCoverCurrentInput([row, row], [assetId, "other-piece"], expected),
    ).toBe(false);
    expect(
      matchesCoverCurrentInput([row], [assetId], {
        ...expected,
        preferenceFingerprint: "new",
      }),
    ).toBe(false);
    expect(
      matchesCoverCurrentInput([row], [assetId], {
        ...expected,
        inventoryFingerprint: "changed",
      }),
    ).toBe(false);
  });
  it("allows only an unchanged retryable failure within both budgets", () => {
    expect(createOperationPolicy(operation, "current")).toMatchObject({
      canRetry: true,
      canRestart: false,
      retryBlockedReason: null,
      assetId,
      runtimeVersion: CREATE_RUNTIME_VERSION,
    });
    expect(
      createOperationPolicy({ ...operation, attempt_count: 3 }, "current")
        .retryBlockedReason,
    ).toBe("attempt_limit");
    expect(
      createOperationPolicy({ ...operation, provider_call_count: 3 }, "current")
        .retryBlockedReason,
    ).toBe("provider_call_limit");
    expect(
      createOperationPolicy({ ...operation, status: "running" }, "current")
        .canRetry,
    ).toBe(false);
  });
  it("keeps invalid output terminal until inputs or runtime change", () => {
    const invalid = { ...operation, result_ref: { retryable: false } };
    expect(createOperationPolicy(invalid, "current")).toMatchObject({
      canRetry: false,
      canRestart: false,
      retryBlockedReason: "non_retryable",
    });
    expect(createOperationPolicy(invalid, "changed")).toMatchObject({
      canRetry: false,
      canRestart: true,
      retryBlockedReason: "input_changed",
    });
    expect(
      createOperationPolicy({ ...invalid, input: { assetId } }, "v3"),
    ).toMatchObject({
      canRetry: false,
      canRestart: true,
      retryBlockedReason: "runtime_changed",
      runtimeVersion: null,
    });
  });
  it("never offers recovery when current inputs cannot be verified", () => {
    expect(createOperationPolicy(operation, null)).toMatchObject({
      canRetry: false,
      canRestart: false,
      retryBlockedReason: "current_input_unavailable",
    });
  });
  it("persists runtime identity and fingerprints the current source inputs", () => {
    const look = {
      id: "6762a315-1490-409b-909b-f424450b06af",
      revision: 1,
      inspiration_asset_id: assetId,
      occasion: "Work",
    };
    const input = createInputSnapshot({
      kind: "inspiration_description",
      look,
      pieces: [],
      inventoryMode: "combined",
    });
    expect(input.runtimeVersion).toBe(CREATE_RUNTIME_VERSION);
    const fingerprint = (snapshot: typeof input) =>
      createOperationFingerprint({
        kind: "inspiration_description",
        input: snapshot,
        versions: { promptVersion: "test" },
        model: "test-model",
        subjectId: look.id,
        revision: 1,
      });
    expect(fingerprint(input)).toBe(fingerprint({ ...input }));
    expect(fingerprint(input)).not.toBe(
      fingerprint({ ...input, occasion: "Travel" }),
    );
    const configured = {
      ...input,
      draftId: assetId,
      providerSettings: {
        version: "fashion-request.v1",
        model: "test-model",
        reasoningEffort: "low",
        maxOutputTokens: 24000,
      },
    };
    expect(fingerprint(configured)).not.toBe(fingerprint(input));
    expect(fingerprint(configured)).not.toBe(
      fingerprint({
        ...configured,
        providerSettings: {
          ...configured.providerSettings,
          reasoningEffort: "none",
        },
      }),
    );
    expect(fingerprint(configured)).not.toBe(
      fingerprint({
        ...configured,
        providerSettings: {
          ...configured.providerSettings,
          maxOutputTokens: 16000,
        },
      }),
    );
  });
});
