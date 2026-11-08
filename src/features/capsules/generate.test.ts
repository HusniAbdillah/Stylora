import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createHash } from "node:crypto";
vi.mock("server-only", () => ({}));
const controls = vi.hoisted(() => ({
  database: vi.fn(),
  capsule: vi.fn(),
  preferences: vi.fn(),
  start: vi.fn(),
  read: vi.fn(),
  run: vi.fn(),
  fail: vi.fn(),
  generate: vi.fn(),
  sourceVersions: {
    promptVersion: "stylora-fashion-v1",
    knowledgeVersion: "fashion-knowledge-fixture",
    schemaVersion: "fashion-item.v1",
    promptSourceHash: "b".repeat(64),
    knowledgeSourceHash: "a".repeat(64),
    schemaSourceHash: "c".repeat(64),
    promptAssemblyHash: "d".repeat(64),
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  getWorkspaceDatabase: controls.database,
  requireWorkspaceWrites: vi.fn(),
}));
vi.mock("./queries", () => ({ getCapsule: controls.capsule }));
vi.mock("@/features/preferences/server", () => ({
  getPersonalizationSnapshot: controls.preferences,
}));
vi.mock("@/features/ai/openai", () => ({
  FASHION_KNOWLEDGE_VERSION: "a".repeat(64),
  FASHION_PROMPT_VERSION: "fixture-legacy",
  CAPSULE_PROMPT_VERSION: "fixture-capsule-v2",
  FASHION_SCHEMA_VERSION: "fashion-item.v1",
  CAPSULE_SOURCE_VERSIONS: controls.sourceVersions,
  TEXT_MODEL: "gpt-5-mini",
  generateFashionJson: controls.generate,
}));
vi.mock("@/features/operations/server", async () => ({
  ...(await vi.importActual<typeof import("@/features/operations/errors")>(
    "@/features/operations/errors",
  )),
  startOperation: controls.start,
  readOperation: controls.read,
  runOperation: controls.run,
  failOperation: controls.fail,
  assertWorkflowRpc: vi.fn(),
  operationStatus: (operation: unknown) => operation,
}));
import { generateCapsule, runCapsuleOperation } from "./generate";
import {
  capsuleFixtureBrief as brief,
  capsuleFixtureItems,
  capsuleOutputFixture,
} from "./generation-fixtures";
import { OperationError } from "@/features/operations/errors";
import { ApiError } from "@/lib/api";
import type {
  Operation,
  StartOperationInput,
} from "@/features/operations/schema";
import type {
  OperationHandler,
  OperationClaim,
} from "@/features/operations/server";
import type { CapsuleProviderMetadata } from "@/features/ai/openai";
import {
  readOperationCheckpoint,
  checkpointOperationResult,
} from "@/features/operations/checkpoints";

const workspaceId = "ae781e34-b315-44a5-abfe-0c6c074a49c8";
const capsuleId = "d270f645-b0d9-4c6f-8593-a154f31b98c9";
const operationId = "20000000-0000-4000-8000-000000000001";
let operation: Operation;
let providerCount: number;
let providerRequestId: string | null;
let sourceItems = structuredClone(capsuleFixtureItems);
let capsuleRevision: number;
let metadataFailure: "read" | "write" | null;
let metadata: { model: string; prompt_version: string; schema_version: string };
let checkpoint: {
  result: z.infer<ReturnType<typeof z.json>>;
  metadata: z.infer<ReturnType<typeof z.json>>;
} | null;
const queries: {
  table: string;
  filters: [string, string, unknown][];
  changes?: Record<string, unknown>;
}[] = [];
const rpc = vi.fn();
const providerMetadata: CapsuleProviderMetadata = {
  model: "gpt-5-mini",
  promptVersion: "fixture-capsule-v2",
  schemaVersion: "fashion-item.v1",
  knowledgeVersion: "a".repeat(64),
  providerAttempts: 1,
  latencyMs: 15,
  usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
  requests: [
    {
      attempt: 1,
      requestId: "req_fixture",
      latencyMs: 15,
      responseStatus: "completed",
      usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
    },
  ],
};

function from(table: string) {
  const entry: (typeof queries)[number] = { table, filters: [] };
  queries.push(entry);
  let selection = "";
  const query = {
    select: (columns: string) => {
      selection = columns;
      return query;
    },
    update: (changes: Record<string, unknown>) => {
      entry.changes = changes;
      return query;
    },
    eq: (column: string, value: unknown) => {
      entry.filters.push(["eq", column, value]);
      return query;
    },
    is: (column: string, value: unknown) => {
      entry.filters.push(["is", column, value]);
      return query;
    },
    gt: (column: string, value: unknown) => {
      entry.filters.push(["gt", column, value]);
      return query;
    },
    in: (column: string, value: unknown) => {
      entry.filters.push(["in", column, value]);
      return query;
    },
    abortSignal: () => query,
    order: async () => ({ data: structuredClone(sourceItems), error: null }),
    maybeSingle: async () => {
      if (table === "operation_result_checkpoints") {
        expect(entry.filters).toEqual(
          expect.arrayContaining([
            ["eq", "workspace_id", workspaceId],
            ["eq", "operation_id", operationId],
            ["eq", "input_fingerprint", operation.input_fingerprint],
          ]),
        );
        return {
          data: checkpoint ? structuredClone(checkpoint) : null,
          error: null,
        };
      }
      if (
        (metadataFailure === "read" &&
          selection === "result_ref,status,provider_call_count") ||
        (metadataFailure === "write" && entry.changes?.result_ref)
      )
        return { data: null, error: { code: "FIXTURE_METADATA_FAILURE" } };
      const row: Record<string, unknown> = {
        ...operation,
        ...metadata,
        provider_call_count: providerCount,
      };
      const matches = entry.filters.every(([method, column, value]) =>
        method === "in"
          ? Array.isArray(value) && value.includes(row[column])
          : method === "gt"
            ? Date.parse(String(row[column])) > Date.parse(String(value))
            : column === "result_ref" && method === "eq"
              ? JSON.stringify(row[column]) === value
              : row[column] === value,
      );
      if (!matches) return { data: null, error: null };
      if (entry.changes) {
        if ("provider_call_count" in entry.changes)
          providerCount = z.number().parse(entry.changes.provider_call_count);
        if ("result_ref" in entry.changes)
          operation.result_ref = z
            .record(z.string(), z.json())
            .parse(entry.changes.result_ref);
        if ("provider_request_id" in entry.changes)
          providerRequestId = z
            .string()
            .parse(entry.changes.provider_request_id);
        return { data: { id: operation.id }, error: null };
      }
      if (selection === "model,prompt_version,schema_version")
        return { data: metadata, error: null };
      if (selection === "provider_call_count")
        return { data: { provider_call_count: providerCount }, error: null };
      return {
        data: {
          result_ref: operation.result_ref,
          status: operation.status,
          provider_call_count: providerCount,
        },
        error: null,
      };
    },
  };
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
  sourceItems = structuredClone(capsuleFixtureItems);
  capsuleRevision = 1;
  providerCount = 0;
  providerRequestId = null;
  metadataFailure = null;
  checkpoint = null;
  vi.stubEnv("OPENAI_CAPSULE_REASONING_EFFORT", "low");
  vi.stubEnv("OPENAI_CAPSULE_MAX_OUTPUT_TOKENS", "9000");
  metadata = {
    model: "gpt-5-mini",
    prompt_version: "fixture-capsule-v2",
    schema_version: "fashion-item.v1",
  };
  operation = {
    id: operationId,
    workspace_id: workspaceId,
    kind: "capsule_generation",
    subject_type: "capsule",
    subject_id: capsuleId,
    status: "queued",
    input_revision: 1,
    input_fingerprint: "a".repeat(64),
    input: {},
    attempt_count: 0,
    lease_until: "2099-01-01T00:00:00Z",
    result_ref: null,
    safe_error_code: null,
    cancel_requested_at: null,
    created_at: "2026-11-08T00:00:00Z",
    updated_at: "2026-11-08T00:00:00Z",
  };
  controls.database.mockReturnValue({
    workspaceId,
    writesEnabled: true,
    client: { from, rpc },
  });
  controls.capsule.mockImplementation(async () => ({
    id: capsuleId,
    revision: capsuleRevision,
    brief,
  }));
  controls.preferences.mockResolvedValue({ preferences: {}, revision: 1 });
  controls.start.mockImplementation(async (input: StartOperationInput) => {
    operation = {
      ...operation,
      input: structuredClone(input.input),
      input_revision: input.inputRevision,
      input_fingerprint: input.inputFingerprint,
    };
    return structuredClone(operation);
  });
  controls.read.mockImplementation(async () => structuredClone(operation));
  controls.fail.mockImplementation(async (_claim, failure) => {
    operation.status = ["CAPSULE_SUPERSEDED", "INPUT_SUPERSEDED"].includes(
      failure.code,
    )
      ? "superseded"
      : "failed";
    operation.safe_error_code = failure.code;
    operation.result_ref = { retryable: failure.retryable };
  });
  controls.run.mockImplementation(
    async (_id: string, handler: OperationHandler<unknown>) => {
      operation.status = "running";
      operation.attempt_count++;
      const claim: OperationClaim = {
        operationId,
        inputRevision: operation.input_revision,
        inputFingerprint: operation.input_fingerprint,
        attemptCount: operation.attempt_count,
        input: operation.input,
        signal: new AbortController().signal,
      };
      let checkpointed = false;
      try {
        const stored = handler.checkpoint
          ? await readOperationCheckpoint(claim)
          : null;
        const output =
          stored && handler.checkpoint
            ? await handler.checkpoint.restore(
                claim,
                stored.result,
                stored.metadata,
              )
            : await handler.execute(claim);
        if (handler.checkpoint && !stored)
          await checkpointOperationResult(
            claim,
            handler.checkpoint.serialize(output),
          );
        checkpointed = !!handler.checkpoint;
        await handler.commit(claim, output);
      } catch (error) {
        const failure =
          error instanceof OperationError
            ? error
            : new OperationError(
                "OPERATION_EXECUTION_FAILED",
                "Fixture failure.",
              );
        await handler.fail?.(claim, {
          code:
            checkpointed && failure.status >= 500
              ? "CHECKPOINT_COMMIT_PENDING"
              : failure.code,
          retryable:
            checkpointed && failure.status >= 500 ? true : failure.retryable,
          checkpointed,
        });
      }
      return structuredClone(operation);
    },
  );
  controls.generate.mockImplementation(async (input) => {
    await input.beforeRequest?.(1);
    try {
      const capturedProvider = {
        ...providerMetadata,
        model: input.config.model,
        promptVersion: input.legacy
          ? "fixture-legacy"
          : providerMetadata.promptVersion,
      };
      await input.onProviderMetadata?.(capturedProvider);
      return {
        value: input.validate(capsuleOutputFixture()),
        providerMetadata: capturedProvider,
        providerAttempts: 1,
      };
    } finally {
      await input.afterRequest?.(1);
    }
  });
  rpc.mockImplementation((name: string, input: Record<string, unknown>) => {
    expect(input).toMatchObject({
      p_workspace_id: workspaceId,
      p_operation_id: operationId,
      p_input_fingerprint: operation.input_fingerprint,
    });
    let data: unknown = null;
    let error: { code: string } | null = null;
    if (name === "reserve_workflow_provider_call") {
      expect(input).toMatchObject({
        p_attempt: operation.attempt_count,
        p_text_daily_limit: expect.any(Number),
        p_image_daily_limit: expect.any(Number),
      });
      if (providerCount >= 3) error = { code: "54000" };
      else providerCount++;
    } else if (name === "release_workflow_provider_call") {
      expect(input.p_attempt).toBe(operation.attempt_count);
    } else if (name === "checkpoint_workflow_result") {
      expect(input.p_attempt).toBe(operation.attempt_count);
      const captured = {
        result: z.json().parse(input.p_result),
        metadata: z.json().parse(input.p_metadata),
      };
      if (checkpoint) expect(captured).toEqual(checkpoint);
      checkpoint = structuredClone(captured);
      data = checkpoint;
    } else if (name === "commit_capsule_generation") {
      expect(input.p_attempt_count).toBe(operation.attempt_count);
      operation.status = "succeeded";
      operation.result_ref = {
        capsuleId,
        outfitIds: z
          .array(z.object({ id: z.uuid() }))
          .parse(input.p_outfits)
          .map((outfit) => outfit.id),
      };
      data = operation;
    } else throw new Error(`Unexpected fixture RPC: ${name}`);
    const response = Promise.resolve({ data, error });
    return Object.assign(response, { abortSignal: () => response });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Capsule captured worker execution", () => {
  it("allocates without provider work and executes the exact operation without another start", async () => {
    await generateCapsule(capsuleId, { execute: false });
    expect(controls.run).not.toHaveBeenCalled();
    expect(controls.generate).not.toHaveBeenCalled();
    expect(operation.input).toMatchObject({
      contractVersion: "capsule-context.v2",
      generationConfig: {
        version: "capsule-generation.v3",
        model: metadata.model,
        reasoningEffort: "low",
        maxOutputTokens: 6000,
      },
    });
    const capturedFingerprint = operation.input_fingerprint;
    const result = await runCapsuleOperation(operationId);
    expect(result.status).toBe("succeeded");
    expect(controls.start).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "commit_capsule_generation",
      expect.objectContaining({
        p_workspace_id: workspaceId,
        p_operation_id: operationId,
        p_attempt_count: 1,
        p_input_fingerprint: capturedFingerprint,
        p_expected_revision: 1,
      }),
    );
    expect(providerCount).toBe(1);
    expect(providerRequestId).toBe("req_fixture");
    expect(checkpoint).toMatchObject({
      result: { outfits: expect.any(Array) },
      metadata: { capturedMetadata: metadata },
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "reserve_workflow_provider_call",
      "release_workflow_provider_call",
      "checkpoint_workflow_result",
      "commit_capsule_generation",
    ]);
    expect(result.result_ref).toMatchObject({
      capsuleId,
      provider: {
        workflowAttempt: 1,
        operationCallCount: 1,
        usageScope: "workflow_attempt",
        providerAttempts: 1,
        usage: providerMetadata.usage,
      },
    });
    for (const query of queries.filter(
      (query) => query.table === "workflow_operations",
    ))
      expect(query.filters).toEqual(
        expect.arrayContaining([
          ["eq", "workspace_id", workspaceId],
          ["eq", "id", operationId],
          ["eq", "attempt_count", 1],
          ["eq", "input_fingerprint", capturedFingerprint],
        ]),
      );
  });
  it("validates malformed captures after claim so they can reach a terminal failure", async () => {
    operation.input = { malformed: true };
    const result = await runCapsuleOperation(operationId);
    expect(controls.run).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: "failed",
      safe_error_code: "CAPSULE_CONTEXT_INVALID",
    });
    expect(controls.generate).not.toHaveBeenCalled();
    expect(controls.start).not.toHaveBeenCalled();
  });
  it("rejects stale inputs before model and before atomic commit", async () => {
    await generateCapsule(capsuleId, { execute: false });
    sourceItems[0].revision = 2;
    expect(await runCapsuleOperation(operationId)).toMatchObject({
      status: "superseded",
      safe_error_code: "CAPSULE_SUPERSEDED",
    });
    expect(controls.generate).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("keeps temporary dependency-read failures retryable before provider work", async () => {
    await generateCapsule(capsuleId, { execute: false });
    controls.capsule.mockRejectedValueOnce(
      new ApiError("capsule_read_failed", "Fixture read failure.", 503, true),
    );
    expect(await runCapsuleOperation(operationId)).toMatchObject({
      status: "failed",
      safe_error_code: "CAPSULE_CONTEXT_UNAVAILABLE",
      result_ref: { retryable: true },
    });
    expect(controls.generate).not.toHaveBeenCalled();
    expect(providerCount).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    [404, "superseded", "CAPSULE_SUPERSEDED"],
    [409, "superseded", "CAPSULE_SUPERSEDED"],
    [422, "failed", "CAPSULE_CONTEXT_INVALID"],
  ])(
    "keeps dependency status %s terminal without paid work",
    async (status, state, code) => {
      await generateCapsule(capsuleId, { execute: false });
      controls.capsule.mockRejectedValueOnce(
        new ApiError(
          "capsule_context_invalid",
          "Fixture context failure.",
          Number(status),
        ),
      );
      expect(await runCapsuleOperation(operationId)).toMatchObject({
        status: state,
        safe_error_code: code,
        result_ref: { retryable: false },
      });
      expect(controls.generate).not.toHaveBeenCalled();
      expect(providerCount).toBe(0);
    },
  );
  it("does not commit a result after the Capsule changes during generation", async () => {
    await generateCapsule(capsuleId, { execute: false });
    controls.generate.mockImplementationOnce(async (input) => {
      await input.beforeRequest();
      await input.onProviderMetadata(providerMetadata);
      capsuleRevision = 2;
      return { value: capsuleOutputFixture(), providerMetadata };
    });
    expect(await runCapsuleOperation(operationId)).toMatchObject({
      status: "superseded",
      safe_error_code: "CAPSULE_SUPERSEDED",
    });
    expect(
      rpc.mock.calls.some(([name]) => name === "commit_capsule_generation"),
    ).toBe(false);
    expect(providerCount).toBe(1);
  });
  it("keeps reserved calls and safe metadata after transport failure", async () => {
    await generateCapsule(capsuleId, { execute: false });
    controls.generate.mockImplementationOnce(async (input) => {
      await input.beforeRequest(1);
      await input.onProviderMetadata({
        ...providerMetadata,
        usage: null,
        requests: [
          {
            ...providerMetadata.requests[0],
            usage: null,
            responseStatus: "request_failed",
          },
        ],
      });
      throw new OperationError(
        "OPENAI_CONNECTION_FAILED",
        "Fixture network failure.",
        503,
        true,
      );
    });
    const result = await runCapsuleOperation(operationId);
    expect(providerCount).toBe(1);
    expect(result.status).toBe("failed");
    expect(result.result_ref).toMatchObject({
      retryable: true,
      provider: { providerAttempts: 1, usage: null, operationCallCount: 1 },
    });
  });
  it("caps the operation ledger at three requests across retries", async () => {
    await generateCapsule(capsuleId, { execute: false });
    providerCount = 2;
    controls.generate.mockImplementationOnce(async (input) => {
      await input.beforeRequest(1);
      await input.onProviderMetadata(providerMetadata);
      await input.beforeRequest(2);
      throw new Error("Reservation should stop the second request.");
    });
    const result = await runCapsuleOperation(operationId);
    expect(providerCount).toBe(3);
    expect(result).toMatchObject({
      status: "failed",
      safe_error_code: "PROVIDER_BUDGET_EXHAUSTED",
    });
    expect(
      rpc.mock.calls.filter(
        ([name]) => name === "reserve_workflow_provider_call",
      ),
    ).toHaveLength(2);
  });
  it.each([
    ["succeeded", "read"],
    ["succeeded", "write"],
    ["failed", "read"],
    ["failed", "write"],
  ] as const)(
    "preserves %s when optional provider metadata %s fails",
    async (status, failure) => {
      const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
      await generateCapsule(capsuleId, { execute: false });
      metadataFailure = failure;
      if (status === "failed")
        controls.generate.mockImplementationOnce(async (input) => {
          await input.beforeRequest(1);
          await input.onProviderMetadata(providerMetadata);
          throw new OperationError(
            "OPENAI_CONNECTION_FAILED",
            "Fixture network failure.",
            503,
            true,
          );
        });
      const result = await runCapsuleOperation(operationId);
      expect(result.status).toBe(status);
      expect(result.result_ref).toMatchObject(
        status === "succeeded" ? { capsuleId } : { retryable: true },
      );
      expect(controls.fail).toHaveBeenCalledTimes(status === "failed" ? 1 : 0);
      expect(controls.generate).toHaveBeenCalledTimes(1);
      expect(providerCount).toBe(1);
      expect(warning).toHaveBeenCalledExactlyOnceWith(
        "CAPSULE_METADATA_UNAVAILABLE",
        { operationId, attemptCount: 1 },
      );
    },
  );
  it("executes compatible legacy captures with their original fingerprint and context", async () => {
    const input = {
      brief,
      capsuleRevision: 1,
      items: sourceItems.map(({ inferred_attributes, ...item }) => ({
        ...item,
        attributes: { ...inferred_attributes, ...item.attributes },
      })),
      knowledgeVersion: "a".repeat(64),
      itemRevisions: Object.fromEntries(
        sourceItems.map((item) => [item.id, item.revision]),
      ),
      preferences: {},
      preferenceRevision: 1,
      allowedSignals: [
        "Owned wardrobe",
        "Weather: Mild",
        "Activities: City walks",
        "Dress code: Casual",
        "Palette: Warm neutrals",
      ],
      instructions:
        "Return the requested number of complete, meaningfully distinct outfits. Use exact allowedSignals in inputsUsed. Only use supplied owned IDs. Respect required and excluded IDs. Additions must unlock at least two demonstrated outfits. Keep all uncertainty explicit.",
    };
    operation.input = input;
    metadata.prompt_version = "fixture-legacy";
    operation.input_fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          input,
          prompt: metadata.prompt_version,
          schema: metadata.schema_version,
          knowledge: "a".repeat(64),
          model: metadata.model,
        }),
      )
      .digest("hex");
    const result = await runCapsuleOperation(operationId);
    expect(result.status).toBe("succeeded");
    expect(controls.start).not.toHaveBeenCalled();
    expect(controls.generate.mock.calls[0][0]).toMatchObject({
      legacy: true,
      context: input,
    });
  });
});
