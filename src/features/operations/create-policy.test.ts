import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  CREATE_RUNTIME_VERSION,
  createInputSnapshot,
  createOperationFingerprint,
  createOperationPolicy,
  createResultMatchesRuntime,
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
  safe_error_code: "PROVIDER_TIMEOUT",
};

describe("Create operation recovery policy", () => {
  it("invalidates cached results when model controls or prompt assembly change, independent of JSON key order", () => {
    const settings = {
      version: "fashion-request.v1" as const,
      model: "fixture-model",
      reasoningEffort: "low" as const,
      maxOutputTokens: 24000,
    };
    const versions = {
      promptAssemblyHash: "fixture-prompt",
      promptVersion: "fixture-version",
      schemaVersion: "fashion-item.v1",
    };
    const metadata = {
      providerSettings: settings,
      model: settings.model,
      ...versions,
      handlerVersion: CREATE_RUNTIME_VERSION,
    };
    expect(
      createResultMatchesRuntime(
        Object.fromEntries(Object.entries(metadata).reverse()),
        settings,
        versions,
      ),
    ).toBe(true);
    expect(
      createResultMatchesRuntime(
        metadata,
        { ...settings, model: "changed-model" },
        versions,
      ),
    ).toBe(false);
    expect(
      createResultMatchesRuntime(
        metadata,
        { ...settings, reasoningEffort: "none" },
        versions,
      ),
    ).toBe(false);
    expect(
      createResultMatchesRuntime(
        metadata,
        { ...settings, maxOutputTokens: 16000 },
        versions,
      ),
    ).toBe(false);
    expect(
      createResultMatchesRuntime(metadata, settings, {
        ...versions,
        promptAssemblyHash: "new-prompt",
      }),
    ).toBe(false);
    expect(createResultMatchesRuntime({}, settings, versions)).toBe(false);
  });
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
      createOperationPolicy(
        {
          ...operation,
          provider_call_count: 3,
          result_ref: { retryable: true, checkpointed: true },
        },
        "current",
      ).canRetry,
    ).toBe(true);
    expect(
      createOperationPolicy({ ...operation, status: "running" }, "current")
        .canRetry,
    ).toBe(false);
  });
  it("keeps canonical retry classification and the stored Retry-After deadline", () => {
    const now = Date.UTC(2026, 10, 8, 5);
    const retryAfter = new Date(now + 60000).toISOString();
    const deferred = {
      ...operation,
      safe_error_code: "PROVIDER_RATE_LIMITED",
      result_ref: { retryable: true, retryAfter },
    };
    expect(createOperationPolicy(deferred, "current", now)).toMatchObject({
      canRetry: false,
      retryBlockedReason: "retry_backoff",
      retryAfter,
    });
    expect(
      createOperationPolicy(deferred, "current", now + 60000).canRetry,
    ).toBe(true);
    expect(
      createOperationPolicy(
        { ...deferred, safe_error_code: "provider_timeout" },
        "current",
        now + 60000,
      ).canRetry,
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
    expect(fingerprint(input)).toBe(
      fingerprint(Object.fromEntries(Object.entries(input).reverse())),
    );
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
