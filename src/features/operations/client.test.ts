import { afterEach, describe, expect, it, vi } from "vitest";
import { startOperationRequest } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("navigation-independent operation requests", () => {
  it("extracts a queued Preview operation from its job envelope and semantic key", async () => {
    vi.useFakeTimers();
    const id = "7835d538-e16b-46b1-a1ee-8f32e533d2ea";
    const draftId = "27cc150c-452f-4b2a-bce8-9c5c4c4ceacf";
    const complete = {
      data: {
        draftId,
        revision: 2,
        operationId: id,
        job: {
          status: "succeeded",
          imageUrl: "https://assets.example.invalid/image.png",
        },
      },
    };
    const fetchRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          data: {
            draftId,
            revision: 2,
            operationId: id,
            job: { status: "queued" },
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ data: { id, status: "queued", leaseUntil: null } }),
      )
      .mockResolvedValueOnce(Response.json(complete));
    vi.stubGlobal("fetch", fetchRequest);
    const pending = startOperationRequest(
      "preview:synthetic-selection",
      "/api/previews",
      { method: "POST" },
    );
    await vi.advanceTimersByTimeAsync(3000);
    expect(await (await pending).json()).toEqual(complete);
    expect(fetchRequest.mock.calls[1][0]).toBe(
      `/api/workflow-operations/${id}`,
    );
  });

  it("refreshes the Preview snapshot after a healthy operation finishes without another POST", async () => {
    vi.useFakeTimers();
    const id = "a2b00585-b7da-4e20-9926-a1413bce2265";
    const draftId = "69df70f4-8d53-43ba-b0f9-939b0c2af769";
    const complete = {
      data: {
        draftId,
        revision: 1,
        operationId: id,
        job: {
          status: "succeeded",
          imageUrl: "https://assets.example.invalid/image.png",
        },
      },
    };
    const fetchRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          data: { draftId, operationId: id, job: { status: "running" } },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ data: { id, status: "succeeded", leaseUntil: null } }),
      )
      .mockResolvedValueOnce(Response.json(complete));
    vi.stubGlobal("fetch", fetchRequest);
    const pending = startOperationRequest(
      "preview:synthetic-active",
      "/api/previews",
      { method: "POST" },
    );
    await vi.advanceTimersByTimeAsync(3000);
    expect(await (await pending).json()).toEqual(complete);
    expect(fetchRequest.mock.calls.map(([, init]) => init?.method)).toEqual([
      "POST",
      "GET",
      "GET",
    ]);
  });

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
