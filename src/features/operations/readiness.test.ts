import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../lib/config/server", () => ({
  readDatabaseConfig: () => ({
    url: "https://example.invalid",
    secretKey: "synthetic-server-key",
  }),
}));

import { assertWorkflowRpc } from "./readiness";

afterEach(() => vi.unstubAllGlobals());

describe("hosted workflow RPC readiness", () => {
  it("uses a read-only OpenAPI request before accepting a write RPC", async () => {
    const fetchRequest = vi.fn(async () =>
      Response.json({
        paths: { "/rpc/complete_preview_operation": { post: {} } },
      }),
    );
    vi.stubGlobal("fetch", fetchRequest);
    await assertWorkflowRpc("complete_preview_operation");
    expect(fetchRequest).toHaveBeenCalledWith(
      "https://example.invalid/rest/v1/",
      expect.objectContaining({ method: "GET", redirect: "error" }),
    );
    expect(fetchRequest).toHaveBeenCalledOnce();
  });

  it("rejects missing or GET-only RPC definitions with a safe unavailable code", async () => {
    const fetchRequest = vi.fn(async () =>
      Response.json({
        paths: { "/rpc/complete_preview_operation": { get: {} } },
      }),
    );
    vi.stubGlobal("fetch", fetchRequest);
    await expect(
      assertWorkflowRpc("complete_preview_operation"),
    ).rejects.toMatchObject({ code: "WORKFLOW_RPC_UNAVAILABLE", status: 503 });
    await expect(assertWorkflowRpc("missing_rpc")).rejects.toMatchObject({
      code: "WORKFLOW_RPC_UNAVAILABLE",
      status: 503,
    });
  });
});
