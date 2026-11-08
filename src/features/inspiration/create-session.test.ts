import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  execute: vi.fn(),
  preferences: vi.fn(),
}));
vi.mock("@/features/preferences/client-contract", async (original) => ({
  ...(await original<
    typeof import("@/features/preferences/client-contract")
  >()),
  readPreferences: mocks.preferences,
}));
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
  mocks.preferences.mockResolvedValue({
    preferences: {},
    fingerprint: "current",
  });
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("Create session allocation recovery", () => {
  it.each([{ choices: ["Everyday"] }, { choices: ["Work", "Everyday"] }])(
    "flushes queued occasion selections before an immediate upload: $choices",
    async ({ choices }) => {
      const value = session();
      let stored = draftSchema.parse({ ...draft, lookId: null, assetId: null });
      value.state = { ...value.state, draft: stored, look: null };
      let resolve!: () => void;
      const pending = new Promise<void>((done) => {
        resolve = done;
      });
      let patches = 0;
      mocks.request.mockImplementation(
        async (url: string, _schema: unknown, init?: RequestInit) => {
          if (
            url === `/api/workflow-drafts/${draftId}` &&
            init?.method === "PATCH"
          ) {
            const body = JSON.parse(String(init.body));
            if (++patches === 1) await pending;
            stored = draftSchema.parse({
              ...stored,
              revision: stored.revision + 1,
              payload: body.payload,
            });
            return stored;
          }
          if (url === "/api/inspiration/uploads")
            return {
              assetId,
              signedUrl: "https://example.invalid/synthetic-upload",
              mimeType: "image/png",
            };
          if (url === `/api/inspiration/uploads/${assetId}/verify`) {
            expect(JSON.parse(String(init?.body))).toMatchObject({
              expectedRevision: stored.revision,
              occasion: "Everyday",
            });
            stored = {
              ...stored,
              lookId,
              assetId,
              revision: stored.revision + 1,
            };
            return { lookId, revision: 1 };
          }
          if (url === `/api/workflow-drafts/${draftId}`) return stored;
          if (url === `/api/looks/${lookId}`)
            return { ...look, occasion: "Everyday" };
          throw new Error(`Unexpected fixture request: ${url}`);
        },
      );
      const fetch = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 200 }));
      vi.stubGlobal("fetch", fetch);
      const contexts = choices.map((occasion) => value.setOccasion(occasion));
      const upload = value.upload(
        new File(["synthetic image"], "fixture.png", { type: "image/png" }),
      );
      await vi.waitFor(() => expect(patches).toBe(1));
      expect(value.state.contextSaving).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
      resolve();
      await Promise.all([...contexts, upload]);
      expect(value.state).toMatchObject({
        contextSaving: false,
        draftStatus: "saved",
        uploadStatus: "verified",
        look: { occasion: "Everyday" },
        draft: { payload: { occasion: "Everyday" } },
      });
      expect(patches).toBe(choices.length);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(mocks.execute).not.toHaveBeenCalled();
    },
  );
  it("does not leave a stale queued draft save marked saving after navigation", async () => {
    const value = session();
    const otherId = "47cf494d-de80-4d4f-8f64-e96e179d4003";
    mocks.request.mockImplementation(
      async (url: string, _schema: unknown, init?: RequestInit) => {
        if (url === `/api/workflow-drafts/${otherId}`)
          return { ...draft, id: otherId };
        if (url === `/api/looks/${lookId}`) return look;
        throw new Error(
          `Unexpected fixture request: ${url} ${init?.method ?? "GET"}`,
        );
      },
    );
    const saved = value
      .saveDraft({ payload: { occasion: "Everyday" } })
      .catch((error: unknown) => error);
    await value.hydrate(otherId);
    expect(await saved).toBeInstanceOf(Error);
    expect(value.state).toMatchObject({
      draft: { id: otherId },
      draftStatus: "saved",
      contextSaving: false,
    });
    expect(
      mocks.request.mock.calls.some(([url]) => url === "/api/workflow-drafts"),
    ).toBe(false);
  });
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
