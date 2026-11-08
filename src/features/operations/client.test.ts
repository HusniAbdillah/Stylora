import { afterEach, describe, expect, it, vi } from "vitest";
import { startOperationRequest, retryOperationRequest } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("navigation-independent operation requests", () => {
  it.each(["worker", "queue"])(
    "recovers transient %s status reads with GET only and resets backoff after a valid read",
    async (mode) => {
      vi.useFakeTimers();
      const id = "c11bcb6b-7f55-4adc-b212-08731767d972";
      const times: number[] = [];
      const started = Date.now();
      const responses = [
        Response.json(
          { data: { id, status: "queued" } },
          { status: 202, headers: { "X-Stylora-Executor": mode } },
        ),
        new TypeError("Connection interrupted"),
        Response.json({}, { status: 503, headers: { "Retry-After": "2" } }),
        Response.json({}, { status: 502 }),
        Response.json({ data: { id, status: "running" } }),
        Response.json({}, { status: 504 }),
        Response.json({ data: { id, status: "succeeded" } }),
      ];
      const request = vi.fn<typeof fetch>().mockImplementation(async () => {
        times.push(Date.now() - started);
        const response = responses.shift();
        if (response instanceof Error) throw response;
        if (!response) throw new Error("Unexpected request");
        return response;
      });
      vi.stubGlobal("fetch", request);
      const pending = startOperationRequest(id, "/api/avatars/" + id);
      await vi.advanceTimersByTimeAsync(14000);
      expect(await (await pending).json()).toMatchObject({
        data: { status: "succeeded" },
      });
      expect(times).toEqual([0, 3000, 4000, 6000, 10000, 13000, 14000]);
      expect(request.mock.calls.map(([, init]) => init?.method)).toEqual([
        "POST",
        "GET",
        "GET",
        "GET",
        "GET",
        "GET",
        "GET",
      ]);
    },
  );

  it.each([400, 404])(
    "does not retry terminal status HTTP %s",
    async (status) => {
      vi.useFakeTimers();
      const id = "6e33ba68-c50f-40f0-ac78-20f449638588";
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json(
            { data: { id, status: "queued" } },
            { headers: { "X-Stylora-Executor": "worker" } },
          ),
        )
        .mockResolvedValueOnce(
          Response.json({ error: { message: "Unavailable" } }, { status }),
        );
      vi.stubGlobal("fetch", request);
      const pending = startOperationRequest(id, "/api/avatars/" + id);
      await vi.advanceTimersByTimeAsync(3000);
      expect((await pending).status).toBe(status);
      expect(request.mock.calls.map(([, init]) => init?.method)).toEqual([
        "POST",
        "GET",
      ]);
    },
  );

  it.each(["transport", "503"])(
    "bounds consecutive GET failures to eight (%s) without repeating POST",
    async (failure) => {
      vi.useFakeTimers();
      const id = "ec64d4bf-4679-4a3f-bc97-c8a6d895db2b";
      const request = vi
        .fn<typeof fetch>()
        .mockImplementation(async (_url, init) => {
          if (init?.method === "POST")
            return Response.json(
              { data: { id, status: "queued" } },
              { headers: { "X-Stylora-Executor": "worker" } },
            );
          if (failure === "transport") throw new TypeError("Disconnected");
          return Response.json({}, { status: 503 });
        });
      vi.stubGlobal("fetch", request);
      const pending = startOperationRequest(id, "/api/avatars/" + id).catch(
        (error) => error,
      );
      await vi.advanceTimersByTimeAsync(120000);
      expect(await pending).toMatchObject({
        message: "OPERATION_STATUS_UNAVAILABLE",
      });
      expect(
        request.mock.calls.filter(([, init]) => init?.method === "POST"),
      ).toHaveLength(1);
      expect(
        request.mock.calls.filter(([, init]) => init?.method === "GET"),
      ).toHaveLength(8);
    },
  );

  it("respects an HTTP-date Retry-After while keeping the five-minute deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-08T00:00:00Z"));
    const id = "08b7b52b-d960-44fa-9801-48d1e534f597";
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { data: { id, status: "queued" } },
          { headers: { "X-Stylora-Executor": "worker" } },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          {},
          {
            status: 503,
            headers: { "Retry-After": "Sun, 08 Nov 2026 00:00:30 GMT" },
          },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ data: { id, status: "succeeded" } }),
      );
    vi.stubGlobal("fetch", request);
    const pending = startOperationRequest(id, "/api/avatars/" + id);
    await vi.advanceTimersByTimeAsync(29999);
    expect(request).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).ok).toBe(true);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("does not retry past the remaining request deadline", async () => {
    vi.useFakeTimers();
    const id = "4b28e791-514c-4a32-b940-fc013878d57f";
    const request = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 294000));
        return Response.json(
          { data: { id, status: "queued" } },
          { headers: { "X-Stylora-Executor": "worker" } },
        );
      })
      .mockResolvedValueOnce(
        Response.json({}, { status: 503, headers: { "Retry-After": "5" } }),
      );
    vi.stubGlobal("fetch", request);
    const pending = startOperationRequest(id, "/api/avatars/" + id).catch(
      (error) => error,
    );
    await vi.advanceTimersByTimeAsync(300000);
    expect(await pending).toMatchObject({
      message: "OPERATION_STATUS_UNAVAILABLE",
    });
    expect(request.mock.calls.map(([, init]) => init?.method)).toEqual([
      "POST",
      "GET",
    ]);
  });

  it.each(["worker", "queue"])(
    "only polls %s-managed queued and expired jobs without browser execution retries",
    async (mode) => {
      vi.useFakeTimers();
      const id = "be88417c-17f6-4ca4-8c24-c032710d287d";
      const queued = { data: { id, status: "queued", leaseUntil: null } };
      const fetchRequest = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json(queued, {
            status: 202,
            headers: { "X-Stylora-Executor": mode },
          }),
        )
        .mockResolvedValueOnce(Response.json(queued))
        .mockResolvedValueOnce(
          Response.json({
            data: { id, status: "running", leaseUntil: "2000-01-01T00:00:00Z" },
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            data: { id, status: "succeeded", leaseUntil: null },
          }),
        );
      vi.stubGlobal("fetch", fetchRequest);
      const pending = startOperationRequest(id, "/api/avatars/" + id);
      await vi.advanceTimersByTimeAsync(9000);
      expect(await (await pending).json()).toMatchObject({
        data: { status: "succeeded" },
      });
      expect(fetchRequest.mock.calls.map(([, init]) => init?.method)).toEqual([
        "POST",
        "GET",
        "GET",
        "GET",
      ]);
    },
  );
  it.each(["worker", "queue"])(
    "polls a %s retry acknowledgment without posting to its executor again",
    async (mode) => {
      vi.useFakeTimers();
      const id = "cb24d1f8-e355-4991-91ee-f7f6b8f3f59a";
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json(
            { data: { id, status: "queued" } },
            { status: 202, headers: { "X-Stylora-Executor": mode } },
          ),
        )
        .mockResolvedValueOnce(
          Response.json({ data: { id, status: "queued" } }),
        )
        .mockResolvedValueOnce(
          Response.json({ data: { id, status: "succeeded" } }),
        );
      vi.stubGlobal("fetch", request);
      const pending = retryOperationRequest(id, `/api/avatars/${id}`, {});
      await vi.advanceTimersByTimeAsync(6000);
      expect(await (await pending).json()).toMatchObject({
        data: { id, status: "succeeded" },
      });
      expect(
        request.mock.calls.map(([url, init]) => [url, init?.method]),
      ).toEqual([
        [`/api/workflow-operations/${id}/retry`, "POST"],
        [`/api/workflow-operations/${id}`, "GET"],
        [`/api/workflow-operations/${id}`, "GET"],
      ]);
    },
  );
  it("refreshes the Preview envelope after a queue retry without posting another render", async () => {
    vi.useFakeTimers();
    const id = "3ce58b2a-0a95-4816-83d3-c6e11a5c1bc0";
    const draftId = "c0bc4d01-8f05-4701-9d74-089f81de8eda";
    const preview = {
      data: {
        draftId,
        operationId: id,
        job: {
          status: "succeeded",
          imageUrl: "https://example.invalid/fixture.png",
        },
      },
    };
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { data: { id, status: "queued" } },
          { status: 202, headers: { "X-Stylora-Executor": "queue" } },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ data: { id, status: "succeeded" } }),
      )
      .mockResolvedValueOnce(Response.json(preview));
    vi.stubGlobal("fetch", request);
    const pending = retryOperationRequest(id, "/api/previews", {
      draftId,
      expectedRevision: 1,
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(await (await pending).json()).toEqual(preview);
    expect(
      request.mock.calls.map(([url, init]) => [url, init?.method]),
    ).toEqual([
      [`/api/workflow-operations/${id}/retry`, "POST"],
      [`/api/workflow-operations/${id}`, "GET"],
      [`/api/previews?draftId=${draftId}`, "GET"],
    ]);
  });
  it("retains inline retry execution when the acknowledgment is not background managed", async () => {
    const id = "881ea9c6-c992-4339-a163-46d2e314f30a";
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: { id, status: "queued" } }))
      .mockResolvedValueOnce(
        Response.json({ data: { id, status: "succeeded" } }),
      );
    vi.stubGlobal("fetch", request);
    expect((await retryOperationRequest(id, `/api/avatars/${id}`, {})).ok).toBe(
      true,
    );
    expect(
      request.mock.calls.map(([url, init]) => [url, init?.method]),
    ).toEqual([
      [`/api/workflow-operations/${id}/retry`, "POST"],
      [`/api/avatars/${id}`, "POST"],
    ]);
  });
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
