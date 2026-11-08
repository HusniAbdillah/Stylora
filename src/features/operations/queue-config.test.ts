import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { queueConfigured } from "./queue-config";

const secret = "a".repeat(43);
const platform = {
  NODE_ENV: "production",
  STYLORA_DISPATCH_SECRET: secret,
  VERCEL: "1",
  VERCEL_DEPLOYMENT_ID: "dpl_Deployment123",
};
const broker = {
  NODE_ENV: "development",
  STYLORA_DISPATCH_SECRET: secret,
  VERCEL_QUEUE_TOKEN: "fixture-local-broker-token",
  VERCEL_QUEUE_BASE_URL: "http://127.0.0.1:3210",
  VERCEL_CLI_VERSION: "59.26.0",
};

describe("queue configuration", () => {
  it("accepts a deployed platform identity or explicit SDK token with a deployment", () => {
    expect(queueConfigured(platform)).toBe(true);
    expect(
      queueConfigured({
        STYLORA_DISPATCH_SECRET: secret,
        STYLORA_QUEUE_TOKEN: "fixture-sdk-token",
        VERCEL_DEPLOYMENT_ID: "dpl_Deployment123",
      }),
    ).toBe(true);
  });

  it.each([
    undefined,
    "",
    " ",
    "a".repeat(42),
    "a".repeat(129),
    "!".repeat(43),
  ])(
    "requires a valid repair secret even with platform credentials: %s",
    (value) => {
      expect(
        queueConfigured({ ...platform, STYLORA_DISPATCH_SECRET: value }),
      ).toBe(false);
      expect(
        queueConfigured({ ...broker, STYLORA_DISPATCH_SECRET: value }),
      ).toBe(false);
    },
  );

  it.each([undefined, "", "deployment", "dpl_", "dpl_bad/path"])(
    "rejects deployed credentials without a valid deployment ID: %s",
    (deploymentId) => {
      expect(
        queueConfigured({ ...platform, VERCEL_DEPLOYMENT_ID: deploymentId }),
      ).toBe(false);
      expect(
        queueConfigured({
          STYLORA_DISPATCH_SECRET: secret,
          STYLORA_QUEUE_TOKEN: "fixture-sdk-token",
          VERCEL_DEPLOYMENT_ID: deploymentId,
        }),
      ).toBe(false);
    },
  );

  it.each([
    "http://127.0.0.1:3210",
    "http://localhost:3210",
    "http://[::1]:3210",
  ])("accepts the development broker on loopback: %s", (url) =>
    expect(queueConfigured({ ...broker, VERCEL_QUEUE_BASE_URL: url })).toBe(
      true,
    ),
  );

  it("keeps the local broker restricted to development with no deployment ID", () => {
    expect(queueConfigured({ ...broker, NODE_ENV: "production" })).toBe(false);
    expect(queueConfigured({ ...broker, NODE_ENV: "test" })).toBe(false);
    expect(
      queueConfigured({ ...broker, VERCEL_DEPLOYMENT_ID: "dpl_Deployment123" }),
    ).toBe(false);
    expect(
      queueConfigured({ ...broker, VERCEL_DEPLOYMENT_ID: "invalid" }),
    ).toBe(false);
    expect(queueConfigured({ ...broker, VERCEL_QUEUE_TOKEN: " " })).toBe(false);
    expect(queueConfigured({ STYLORA_DISPATCH_SECRET: secret })).toBe(false);
  });

  it.each([
    undefined,
    "59.25.9",
    "59.26.0-canary.1",
    "60.0.0-canary.0",
    "59.26",
    "invalid",
  ])("rejects unsupported or unverified CLI versions: %s", (version) =>
    expect(queueConfigured({ ...broker, VERCEL_CLI_VERSION: version })).toBe(
      false,
    ),
  );

  it.each(["59.26.0", "59.27.1", "60.0.0"])(
    "accepts a supported stable CLI version: %s",
    (version) =>
      expect(queueConfigured({ ...broker, VERCEL_CLI_VERSION: version })).toBe(
        true,
      ),
  );

  it.each([
    "http://example.com:3210",
    "http://127.0.0.1.example.com:3210",
    "https://localhost:3210",
    "ftp://localhost:3210",
    "http://user:pass@localhost:3210",
    "not a URL",
    "",
  ])("rejects a nonlocal or credential-bearing broker URL: %s", (url) => {
    expect(queueConfigured({ ...broker, VERCEL_QUEUE_BASE_URL: url })).toBe(
      false,
    );
  });
});
