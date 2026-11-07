import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { checkWorkspaceConnection } from "./connection";
import type { WorkspaceDatabase } from "./server";

const workspaceId = "cccf56bf-ac67-417e-bef1-f43dc6a87aa1";
const foreignWorkspaceId = "0d53751e-c033-4588-9eca-64c8a974bc6b";

function connectionFixture(data: { id: string } | null, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  return {
    context: {
      client: { from } as unknown as WorkspaceDatabase["client"],
      workspaceId,
      writesEnabled: false,
    },
    from,
    select,
    eq,
  };
}

describe("workspace connectivity", () => {
  it("checks the configured workspace rather than treating configuration as a connection", async () => {
    const fixture = connectionFixture({ id: workspaceId });

    await expect(checkWorkspaceConnection(fixture.context)).resolves.toEqual({
      connected: true,
      writesEnabled: false,
    });
    expect(fixture.from).toHaveBeenCalledWith("workspaces");
    expect(fixture.select).toHaveBeenCalledWith("id");
    expect(fixture.eq).toHaveBeenCalledWith("id", workspaceId);
  });

  it("fails closed when the configured workspace is absent or a foreign row is returned", async () => {
    for (const data of [null, { id: foreignWorkspaceId }]) {
      await expect(
        checkWorkspaceConnection(connectionFixture(data).context),
      ).rejects.toMatchObject({
        code: "WORKSPACE_RESOURCE_NOT_FOUND",
      });
    }
  });

  it("does not expose database errors or credential details", async () => {
    const secret = "sensitive-database-error";
    const fixture = connectionFixture(null, { message: secret });

    await expect(
      checkWorkspaceConnection(fixture.context),
    ).rejects.toMatchObject({
      code: "WORKSPACE_CONNECTION_FAILED",
      message: "The workspace database could not be reached.",
    });
  });
});
