import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const operations = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("./server", () => ({ readOperation: operations.read }));

import { ApiError } from "@/lib/api";
import { dispatchOperation } from "./dispatch";

const id = "d270f645-b0d9-4c6f-8593-a154f31b98c9";
beforeEach(() => vi.clearAllMocks());

describe("published Create operation compatibility", () => {
  it("preserves the legacy result envelope and provider metadata", async () => {
    operations.read.mockResolvedValue({ id, kind: "inspiration_description" });
    const dto = {
      id,
      status: "running",
      inputFingerprint: "legacy-fingerprint",
      errorCode: null,
      model: "configured-model",
      resultRef: { optionIds: [id] },
    };
    const legacy = vi.fn().mockResolvedValue(dto);
    const studio = vi.fn();
    const response = await dispatchOperation(id, studio, legacy);
    expect(await response.json()).toEqual({ data: dto });
    expect(legacy).toHaveBeenCalledOnce();
    expect(studio).not.toHaveBeenCalled();
  });

  it("retains legacy error codes when its handler rejects the operation", async () => {
    operations.read.mockRejectedValue(new Error("Unavailable scoped row"));
    const response = await dispatchOperation(id, vi.fn(), async () => {
      throw new ApiError(
        "operation_not_found",
        "This operation is unavailable.",
        404,
      );
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "operation_not_found" },
    });
  });
});
