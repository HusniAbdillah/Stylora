import { afterEach, describe, expect, it, vi } from "vitest";
import { startOperationRequest } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("navigation-independent operation requests", () => {
  it("deduplicates an in-flight operation and gives both callers readable responses", async () => {
    let resolveRequest: (response: Response) => void = () => undefined;
    const request = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    const fetchRequest = vi.fn(() => request);
    vi.stubGlobal("fetch", fetchRequest);

    const first = startOperationRequest("preview-one", "/api/previews", {
      method: "POST",
    });
    const second = startOperationRequest("preview-one", "/api/previews", {
      method: "POST",
    });
    expect(fetchRequest).toHaveBeenCalledOnce();
    expect(fetchRequest.mock.calls[0]).toHaveLength(2);
    resolveRequest(Response.json({ data: { status: "succeeded" } }));
    expect(await (await first).json()).toEqual(await (await second).json());
  });
});
