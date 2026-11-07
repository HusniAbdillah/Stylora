import { afterEach, describe, expect, it, vi } from "vitest";
import { startOperationRequest } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("navigation-independent operation requests", () => {
  it("resubmits a queued operation after checking the latest status", async () => {
    vi.useFakeTimers();
    const id = "d270f645-b0d9-4c6f-8593-a154f31b98c9";
    const fetchRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ data: { id, status: "queued", leaseUntil: null } }),
      )
      .mockResolvedValueOnce(
        Response.json({ data: { id, status: "queued", leaseUntil: null } }),
      )
      .mockResolvedValueOnce(
        Response.json({ data: { id, status: "succeeded", leaseUntil: null } }),
      );
    vi.stubGlobal("fetch", fetchRequest);
    const pending = startOperationRequest(id, "/api/previews", {
      method: "POST",
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(await (await pending).json()).toMatchObject({
      data: { status: "succeeded" },
    });
    expect(fetchRequest.mock.calls.map(([, init]) => init?.method)).toEqual([
      "POST",
      "GET",
      "POST",
    ]);
  });

  it("polls a healthy active lease without another execution request", async () => {
    vi.useFakeTimers();
    const id = "10b76bb1-7aa7-4b92-93b4-3a5a92f52850";
    const fetchRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          data: {
            operation: {
              id,
              status: "running",
              leaseUntil: "2099-01-01T00:00:00Z",
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ data: { id, status: "succeeded", leaseUntil: null } }),
      );
    vi.stubGlobal("fetch", fetchRequest);
    const pending = startOperationRequest(id, "/api/avatars/" + id, {
      method: "POST",
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(await (await pending).json()).toMatchObject({
      data: { operation: { status: "succeeded" } },
    });
    expect(fetchRequest.mock.calls.map(([, init]) => init?.method)).toEqual([
      "POST",
      "GET",
    ]);
  });

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
