import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(
  new URL("../../../public/sw.js", import.meta.url),
  "utf8",
);

function worker() {
  const listeners = {};
  const cache = { addAll: vi.fn(), match: vi.fn() };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi
      .fn()
      .mockResolvedValue([
        "other-app-v1",
        "stylora-offline-v0",
        "stylora-offline-v1",
      ]),
    delete: vi.fn(),
  };
  const fetch = vi.fn();
  runInNewContext(source, {
    self: {
      location: { origin: "https://stylora.test" },
      addEventListener: (name, listener) => {
        listeners[name] = listener;
      },
    },
    caches,
    fetch,
    URL,
    Response,
  });
  return { listeners, cache, caches, fetch };
}

describe("PWA cache boundary", () => {
  it("precaches only public recovery assets and removes only its old caches", async () => {
    const { listeners, cache, caches } = worker();
    let pending;
    const event = {
      waitUntil: (promise) => {
        pending = promise;
      },
    };
    listeners.install(event);
    await pending;
    expect(Array.from(cache.addAll.mock.calls[0][0])).toEqual([
      "/offline.html",
      "/offline-retry.js",
      "/icons/icon-192.png",
    ]);
    listeners.activate(event);
    await pending;
    expect(caches.delete.mock.calls).toEqual([["stylora-offline-v0"]]);
  });

  it("leaves API, RSC, private media, cross-origin requests and writes alone", () => {
    const { listeners, caches, fetch } = worker();
    for (const [url, method] of [
      ["https://stylora.test/api/wardrobe", "GET"],
      ["https://stylora.test/wardrobe?_rsc=abc", "GET"],
      ["https://stylora.test/api/media/photo?token=private", "GET"],
      ["https://storage.test/photo?token=private", "GET"],
      ["https://stylora.test/api/looks", "POST"],
      ["https://stylora.test/icons/icon-192.png?token=private", "GET"],
    ]) {
      const respondWith = vi.fn();
      listeners.fetch({ request: { url, method, mode: "cors" }, respondWith });
      expect(respondWith).not.toHaveBeenCalled();
    }
    expect(caches.open).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps navigation live and falls back without caching workspace responses", async () => {
    const { listeners, cache, caches, fetch } = worker();
    const online = new Response("live workspace");
    const offline = new Response("reconnect");
    fetch
      .mockResolvedValueOnce(online)
      .mockRejectedValueOnce(new TypeError("offline"));
    cache.match.mockResolvedValue(offline);
    const request = {
      url: "https://stylora.test/wardrobe?category=tops",
      method: "GET",
      mode: "navigate",
    };
    let response;
    const respondWith = (promise) => {
      response = promise;
    };
    listeners.fetch({ request, respondWith });
    expect(await response).toBe(online);
    expect(caches.open).not.toHaveBeenCalled();
    listeners.fetch({ request, respondWith });
    expect(await response).toBe(offline);
    expect(cache.match).toHaveBeenCalledWith("/offline.html");
  });
});
