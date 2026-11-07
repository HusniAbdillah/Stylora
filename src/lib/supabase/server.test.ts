import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  assertWorkspaceResource,
  requireWorkspaceWrites,
  WorkspaceAccessError,
} from "./server";

const workspaceId = "cccf56bf-ac67-417e-bef1-f43dc6a87aa1";
const foreignWorkspaceId = "0d53751e-c033-4588-9eca-64c8a974bc6b";

describe("privileged workspace guards", () => {
  it("rejects foreign and missing rows without revealing whether they exist", () => {
    for (const resource of [
      null,
      undefined,
      { workspace_id: foreignWorkspaceId },
    ]) {
      expect(() => assertWorkspaceResource(resource, workspaceId)).toThrowError(
        expect.objectContaining({ code: "WORKSPACE_RESOURCE_NOT_FOUND" }),
      );
    }

    const resource = { id: "selected-item", workspace_id: workspaceId };
    expect(assertWorkspaceResource(resource, workspaceId)).toBe(resource);
  });

  it("requires explicit workspace writes before a mutation can proceed", () => {
    const mutation = vi.fn();
    const write = (writesEnabled: boolean) => {
      requireWorkspaceWrites({ writesEnabled });
      mutation();
    };

    expect(() => write(false)).toThrow(WorkspaceAccessError);
    expect(mutation).not.toHaveBeenCalled();
    write(true);
    expect(mutation).toHaveBeenCalledOnce();
  });
});
