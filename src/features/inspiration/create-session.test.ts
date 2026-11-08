import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ request: vi.fn(), execute: vi.fn() }));
vi.mock("./client-contract", async (original) => ({
  ...(await original<typeof import("./client-contract")>()),
  createRequest: mocks.request,
}));
vi.mock("./pending-file", () => ({
  retainPendingFile: vi.fn(async () => {}),
  restorePendingFile: vi.fn(async () => null),
}));
vi.mock("@/features/operations/client", () => ({
  startOperationRequest: mocks.execute,
}));
import { CreateSession } from "./create-session";
import { draftSchema, lookSchema, operationSchema } from "./client-contract";

const lookId = "6762a315-1490-409b-909b-f424450b06af";
const draftId = "0913da75-d639-4a78-849b-a0d37553c837";
const assetId = "ad77a8cf-c749-48b1-b463-d21dd65ab503";
const operationId = "27521082-6561-47ac-a732-ae19901b7849";
const draft = draftSchema.parse({
  id: draftId,
  featureKind: "inspiration",
  lookId,
  assetId,
  currentStep: "review",
  visitedSteps: ["upload", "review"],
  payload: {},
  status: "active",
  revision: 1,
});
const look = lookSchema.parse({
  id: lookId,
  title: "Unit fixture",
  occasion: null,
  revision: 1,
  status: "draft",
  sourceType: "live",
  inspirationImage: { assetId, url: null, status: "ready", expiresIn: 60 },
  pieces: [],
  confidenceReview: null,
  matches: [],
  outfitOptions: [],
  operations: [],
  marketplaceIntegration: "pending",
});
const operation = operationSchema.parse({
  id: operationId,
  kind: "wardrobe_match",
  status: "failed",
  inputRevision: 1,
  errorCode: "provider_invalid_output",
  inventoryMode: "combined",
  runtimeVersion: "fixture-v1",
  currentRuntimeVersion: "fixture-v1",
  inputFingerprint: "current",
  currentInputFingerprint: "current",
});
function session() {
  const value = new CreateSession("unit-scope");
  value.writesEnabled = true;
  value.state = {
    ...value.state,
    ready: true,
    draft,
    look,
    preferenceFingerprint: "current",
  };
  return value;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("Create session allocation recovery", () => {
  it("can allocate again after a connection failure but does not loop a validated terminal failure", async () => {
    const value = session();
    mocks.request
      .mockRejectedValueOnce(new Error("Synthetic connection failure"))
      .mockResolvedValueOnce(operation);
    await value.start("wardrobe_match");
    await value.start("wardrobe_match");
    await value.start("wardrobe_match");
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("does not execute a late allocation after explicit discard", async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => {
      resolve = done;
    });
    mocks.request.mockImplementation(
      (_url: string, _schema: unknown, init?: RequestInit) =>
        init?.method === "PATCH"
          ? Promise.resolve({ ...draft, status: "discarded" })
          : pending,
    );
    const value = session();
    const allocation = value.start("wardrobe_match");
    await Promise.resolve();
    await value.discard();
    resolve({ ...operation, status: "queued" });
    await allocation;
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(value.state.look).toBeNull();
    expect(value.state.operations).toEqual([]);
  });
  it("does not treat an old preference or inventory fingerprint as the current task", () => {
    const value = session();
    value.state.operations = [
      {
        ...operation,
        status: "running",
        inputFingerprint: "old",
        currentInputFingerprint: "current",
      },
    ];
    expect(value.currentOperation("wardrobe_match")).toBeUndefined();
    value.state.operations = [operation];
    expect(value.currentOperation("wardrobe_match")?.id).toBe(operation.id);
  });
});
