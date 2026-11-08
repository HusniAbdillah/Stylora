import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";

const mocks = vi.hoisted(() => ({ configuration: vi.fn(), executor: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/server", () => ({
  getConfigurationReadiness: mocks.configuration,
}));
vi.mock("./health", () => ({ workflowExecutorReadiness: mocks.executor }));
vi.mock("@/features/ai/openai", () => ({
  AVATAR_PROMPT_VERSION: "avatar-fixture",
  CAPSULE_PROMPT_VERSION: "capsule-fixture",
  IMAGE_MODEL: "image-fixture",
  TEXT_MODEL: "text-fixture",
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.configuration.mockReturnValue({
    databaseConfigured: true,
    writesEnabled: true,
    modelConfigured: true,
    shoppingConfigured: true,
  });
  mocks.executor.mockResolvedValue({
    mode: "queue",
    configured: true,
    errorCode: null,
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("public runtime health", () => {
  it("identifies the deployed commit and prompt versions without credentials", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "a".repeat(40));
    vi.stubEnv("STYLORA_DISPATCH_SECRET", "private-fixture-value");
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.data.runtime).toEqual({
      version: "workflow-runtime.v1",
      commit: "a".repeat(40),
      avatarPromptVersion: "avatar-fixture",
      capsulePromptVersion: "capsule-fixture",
      imageModel: "image-fixture",
      textModel: "text-fixture",
    });
    expect(JSON.stringify(body)).not.toContain("private-fixture-value");
    expect(body.data.executor).toEqual({
      mode: "queue",
      configured: true,
      errorCode: null,
    });
  });
  it("returns unavailable when the queue is unconfigured despite configured database and models", async () => {
    mocks.executor.mockResolvedValue({
      mode: "queue",
      configured: false,
      errorCode: "EXECUTOR_UNCONFIGURED",
    });
    const response = await GET();
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("EXECUTOR_UNCONFIGURED");
  });
  it("reports a missing model key for enabled writes", async () => {
    mocks.configuration.mockReturnValue({
      databaseConfigured: true,
      writesEnabled: true,
      modelConfigured: false,
      shoppingConfigured: false,
    });
    const response = await GET();
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("MODEL_UNCONFIGURED");
  });
  it("keeps read-only browsing independent of an executor", async () => {
    mocks.configuration.mockReturnValue({
      databaseConfigured: true,
      writesEnabled: false,
      modelConfigured: false,
      shoppingConfigured: false,
    });
    mocks.executor.mockResolvedValue({
      mode: "queue",
      configured: false,
      errorCode: "EXECUTOR_UNCONFIGURED",
    });
    expect((await GET()).status).toBe(200);
  });
  it("rejects unsafe commit labels and reports database configuration failures", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "unsafe-build-label");
    mocks.configuration.mockReturnValue({
      databaseConfigured: false,
      writesEnabled: false,
      modelConfigured: false,
      shoppingConfigured: false,
    });
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.data.runtime.commit).toBeNull();
    expect(body.error.code).toBe("WORKSPACE_CONFIGURATION_UNAVAILABLE");
  });
});
