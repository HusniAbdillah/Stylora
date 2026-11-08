import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { searchSerpApi } from "./provider";
import { ApiError } from "@/lib/http";

afterEach(() => vi.unstubAllGlobals());

describe("marketplace request reservations", () => {
  it("reserves only actual requests and shares identical query work", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ shopping_results: [] }));
    vi.stubGlobal("fetch", fetch);
    const reserve = vi.fn().mockResolvedValue(undefined);
    const cachedReserve = vi.fn();
    const first = await searchSerpApi("request-fixture-1", "ivory shirt", "fixture", "context", reserve);
    const second = await searchSerpApi("request-fixture-1", "IVORY SHIRT", "fixture", "context", cachedReserve);
    expect(first).toEqual(second);
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(cachedReserve).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not call the provider when the persisted daily budget is exhausted", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const exhausted = new ApiError("SHOPPING_BUDGET_EXHAUSTED", "Daily search budget reached.", 429, false);
    await expect(searchSerpApi("request-fixture-2", "navy trousers", "fixture", "context", async () => { throw exhausted; })).rejects.toBe(exhausted);
    expect(fetch).not.toHaveBeenCalled();
  });
});
