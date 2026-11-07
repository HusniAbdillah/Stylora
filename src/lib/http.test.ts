import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { apiResponse, readJson } from "./http";

describe("backend response boundary", () => {
  it("does not expose unexpected errors or cache workspace data", async () => {
    const response = await apiResponse(async () => {
      throw new Error("private provider payload");
    });
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain("private provider payload");
  });
  it("rejects oversized streamed bodies without trusting Content-Length", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(65536) }),
    });
    await expect(readJson(request)).rejects.toMatchObject({
      code: "BODY_TOO_LARGE",
      status: 413,
    });
  });
  it("keeps binary media outside the JSON envelope", async () => {
    const response = await apiResponse(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "Content-Type": "image/png" },
        }),
    );
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });
});
