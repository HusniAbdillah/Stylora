"use client";

import { useSyncExternalStore } from "react";

const subscribeToHydration = () => () => {};

/** A browser-local store for the sample workspace. The server always renders the initial snapshot. */
export function createPreviewStore<T>(
  key: string,
  initial: T,
  validate?: (value: unknown) => boolean,
) {
  const storageKey = `stylora.preview.v1.${key}`;
  const listeners = new Set<() => void>();
  let cachedRaw: string | null = null;
  let snapshot = initial;

  function get(): T {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === cachedRaw) return snapshot;
      cachedRaw = raw;
      const parsed = raw === null ? initial : JSON.parse(raw);
      snapshot = !validate || validate(parsed) ? parsed : initial;
    } catch {
      snapshot = initial;
      cachedRaw = null;
    }
    return snapshot;
  }

  function notify() {
    for (const listener of listeners) listener();
  }

  function onStorage(event: StorageEvent) {
    if (event.key === storageKey || event.key === null) notify();
  }

  function subscribe(listener: () => void) {
    if (listeners.size === 0) window.addEventListener("storage", onStorage);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0)
        window.removeEventListener("storage", onStorage);
    };
  }

  function set(value: T | ((previous: T) => T)) {
    const next =
      typeof value === "function"
        ? (value as (previous: T) => T)(get())
        : value;
    const raw = JSON.stringify(next);
    window.localStorage.setItem(storageKey, raw);
    cachedRaw = raw;
    snapshot = next;
    notify();
  }

  function useValue(): T {
    return useSyncExternalStore(subscribe, get, () => initial);
  }

  function useReady(): boolean {
    return useSyncExternalStore(
      subscribeToHydration,
      () => true,
      () => false,
    );
  }

  return { get, set, useValue, useReady };
}
