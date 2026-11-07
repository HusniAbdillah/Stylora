import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreviewStore } from "./store";

afterEach(() => vi.unstubAllGlobals());

function browserStorage() {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
  vi.stubGlobal("window", { localStorage });
  return localStorage;
}

describe("sample workspace persistence", () => {
  it("applies a functional edit to the latest saved value and restores it after reload", () => {
    browserStorage();
    const first = createPreviewStore("example", ["a"]);
    const second = createPreviewStore("example", ["a"]);
    first.set(["b"]);
    second.set((previous) => [...previous, "c"]);
    expect(first.get()).toEqual(["b", "c"]);
    expect(createPreviewStore("example", []).get()).toEqual(["b", "c"]);
  });

  it("rejects invalid stored shape and recovers on the next valid write", () => {
    browserStorage();
    const input = createPreviewStore<unknown>("example", null);
    const names = createPreviewStore<string[]>("example", [], Array.isArray);
    input.set({ old: true });
    expect(names.get()).toEqual([]);
    names.set(["shirt"]);
    expect(names.get()).toEqual(["shirt"]);
  });

  it("keeps previously saved data when a new write exceeds browser storage", () => {
    const storage = browserStorage();
    const name = createPreviewStore("name", "");
    name.set("Studio");
    storage.setItem.mockImplementationOnce(() => {
      throw new Error("Quota exceeded");
    });
    expect(() => name.set("New name")).toThrow();
    expect(name.get()).toBe("Studio");
  });
});
