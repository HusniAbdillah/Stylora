import { describe, expect, it } from "vitest";
import { parseDatabaseConfig } from "./runtime-schema";

const fixture = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_synthetic_fixture",
  STYLORA_WORKSPACE_ID: "cccf56bf-ac67-417e-bef1-f43dc6a87aa1",
};

describe("database configuration", () => {
  it("defaults to read-only and enables writes only explicitly", () => {
    expect(parseDatabaseConfig(fixture)?.writesEnabled).toBe(false);
    expect(
      parseDatabaseConfig({ ...fixture, DEMO_WRITES_ENABLED: "true" })
        ?.writesEnabled,
    ).toBe(true);
    expect(
      parseDatabaseConfig({ ...fixture, DEMO_WRITES_ENABLED: "1" }),
    ).toBeNull();
  });

  it("rejects invalid database scope and credentials", () => {
    expect(parseDatabaseConfig({})).toBeNull();
    expect(
      parseDatabaseConfig({ ...fixture, STYLORA_WORKSPACE_ID: "invalid" }),
    ).toBeNull();
    expect(
      parseDatabaseConfig({
        ...fixture,
        SUPABASE_SECRET_KEY: "sb_publishable_synthetic_fixture",
      }),
    ).toBeNull();
  });

  it("requires an HTTPS origin without embedded credentials or paths", () => {
    for (const url of [
      "invalid",
      "http://example.supabase.co",
      "https://example.supabase.co/rest/v1",
      "https://user:password@example.supabase.co",
    ]) {
      expect(parseDatabaseConfig({ ...fixture, SUPABASE_URL: url })).toBeNull();
    }
  });
});
