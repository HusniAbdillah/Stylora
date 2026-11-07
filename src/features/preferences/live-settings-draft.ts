"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCreateWorkspace } from "@/features/inspiration/create-workspace";
import { SettingsApiError } from "./client-contract";
import {
  clearSettingsRecovery,
  finishSettingsDraft,
  flushSettingsDraft,
  readSettingsDraft,
  readSettingsRecovery,
  writeSettingsRecovery,
  type SettingsDraftInput,
  type SettingsFeature,
} from "./settings-drafts";

type SettingsSnapshot<T> = { value: T; revision: number };
type SettingsConfiguration<T> = {
  feature: SettingsFeature;
  read: () => Promise<SettingsSnapshot<T>>;
  save: (value: T, revision: number) => Promise<SettingsSnapshot<T>>;
  parse: (payload: unknown, saved: T) => T;
  input: (value: T) => SettingsDraftInput;
};
type DraftStatus = "idle" | "draftSaving" | "saving" | "saved" | "error";

export function useLiveSettingsDraft<T>(
  configuration: SettingsConfiguration<T>,
) {
  const { scopeKey, writesEnabled } = useCreateWorkspace();
  const [value, setValue] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<DraftStatus>("idle");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [dirty, setDirty] = useState(false);
  const saved = useRef<SettingsSnapshot<T> | null>(null);
  const latest = useRef<T | null>(null);
  const draftSynced = useRef<T | null>(null);
  const loadVersion = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const unsaved = useRef(false);
  const saving = useRef(false);

  const stopTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const retain = useCallback(
    (next: T) => {
      if (!saved.current) return;
      const current = readSettingsRecovery(scopeKey, configuration.feature);
      const input = configuration.input(next);
      writeSettingsRecovery(scopeKey, {
        ...input,
        version: 1,
        draftId: current?.draftId ?? null,
        savedRevision: saved.current.revision,
        updatedAt: new Date().toISOString(),
      });
    },
    [configuration, scopeKey],
  );

  const flush = useCallback(
    async (next: T) => {
      if (!writesEnabled || !saved.current) return;
      try {
        const result = await flushSettingsDraft(
          scopeKey,
          configuration.input(next),
        );
        draftSynced.current = next;
        if (mounted.current && latest.current === next && !saving.current) {
          setStatus("saved");
          setMessage(
            result.recoveryAvailable
              ? "Draft saved"
              : "Draft saved to the server. Browser recovery is unavailable.",
          );
        }
      } catch (error) {
        if (mounted.current && latest.current === next && !saving.current) {
          setStatus("error");
          setConflict(
            error instanceof SettingsApiError && error.status === 409,
          );
          setMessage(
            error instanceof Error
              ? error.message
              : "Draft could not be saved. Try again.",
          );
        }
        throw error;
      }
    },
    [configuration, scopeKey, writesEnabled],
  );

  const load = useCallback(() => {
    const version = ++loadVersion.current;
    return configuration
      .read()
      .then(async (snapshot) => {
        let next = snapshot.value;
        let baseRevision = snapshot.revision;
        let restored = false;
        let recoveryNotice = "";
        try {
          const recovery = readSettingsRecovery(
            scopeKey,
            configuration.feature,
          );
          if (recovery) {
            next = configuration.parse(recovery.payload, snapshot.value);
            baseRevision = recovery.savedRevision;
            restored = true;
            if (recovery.draftId) {
              try {
                const serverDraft = await readSettingsDraft(
                  configuration.feature,
                  recovery.draftId,
                );
                if (serverDraft.status !== "active") {
                  restored = false;
                  next = snapshot.value;
                  baseRevision = snapshot.revision;
                  clearSettingsRecovery(scopeKey, configuration.feature);
                }
                if (
                  serverDraft.status === "active" &&
                  Date.parse(serverDraft.updatedAt) >
                    Date.parse(recovery.updatedAt)
                ) {
                  next = configuration.parse(
                    serverDraft.payload,
                    snapshot.value,
                  );
                }
              } catch {
                recoveryNotice =
                  "Your local draft was restored. Its server copy could not be loaded.";
              }
            }
          }
        } catch {
          recoveryNotice =
            "Browser recovery is unavailable. Saved workspace values are shown.";
        }
        if (!mounted.current || version !== loadVersion.current) return;
        saved.current = { value: snapshot.value, revision: baseRevision };
        latest.current = next;
        unsaved.current = restored;
        setValue(next);
        setDirty(restored);
        setConflict(baseRevision !== snapshot.revision);
        setStatus("idle");
        setMessage(
          baseRevision !== snapshot.revision
            ? "The shared settings changed while this draft was open. Reload the latest revision before saving."
            : recoveryNotice || (restored ? "Draft restored" : ""),
        );
      })
      .catch((error: unknown) => {
        if (!mounted.current || version !== loadVersion.current) return;
        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Settings could not be loaded. Try again.",
        );
      })
      .finally(() => {
        if (mounted.current && version === loadVersion.current)
          setLoading(false);
      });
  }, [configuration, scopeKey]);

  async function reload() {
    setLoading(true);
    await load();
  }

  useEffect(() => {
    mounted.current = true;
    void load();
    const persistOnLeave = () => {
      if (
        unsaved.current &&
        latest.current !== null &&
        latest.current !== draftSynced.current &&
        !saving.current
      ) {
        void flush(latest.current).catch(() => undefined);
      }
    };
    window.addEventListener("pagehide", persistOnLeave);
    return () => {
      mounted.current = false;
      loadVersion.current += 1;
      stopTimer();
      window.removeEventListener("pagehide", persistOnLeave);
      persistOnLeave();
    };
  }, [load, flush, stopTimer]);

  function change(next: T) {
    if (!writesEnabled || saving.current) return;
    stopTimer();
    latest.current = next;
    unsaved.current = true;
    setValue(next);
    setDirty(true);
    setStatus("draftSaving");
    setMessage("");
    try {
      retain(next);
    } catch {
      setMessage(
        "Browser recovery is unavailable. Keep this page open until the server draft is saved.",
      );
    }
    timer.current = setTimeout(() => {
      void flush(next).catch(() => undefined);
    }, 600);
  }

  async function save(next = latest.current) {
    if (!writesEnabled || !saved.current || next === null || saving.current)
      return;
    stopTimer();
    saving.current = true;
    setStatus("saving");
    setMessage("");
    try {
      const snapshot = await configuration.save(next, saved.current.revision);
      saved.current = snapshot;
      latest.current = snapshot.value;
      unsaved.current = false;
      setValue(snapshot.value);
      setDirty(false);
      setConflict(false);
      let draftNotice = "";
      try {
        await finishSettingsDraft(scopeKey, configuration.feature, "completed");
        clearSettingsRecovery(scopeKey, configuration.feature);
      } catch {
        setDirty(true);
        draftNotice =
          "Saved settings are live. The old draft could not be closed; retry discarding it.";
      }
      setStatus("saved");
      setMessage(draftNotice || "Changes saved to this workspace");
    } catch (error) {
      setStatus("error");
      setConflict(error instanceof SettingsApiError && error.status === 409);
      setMessage(
        error instanceof Error
          ? error.message
          : "Changes could not be saved. Your draft is retained.",
      );
    } finally {
      saving.current = false;
    }
  }

  async function reloadRevision() {
    try {
      const snapshot = await configuration.read();
      saved.current = snapshot;
      setConflict(false);
      setStatus("idle");
      setMessage(
        "Latest revision loaded. Your draft is retained; review it before saving.",
      );
      if (latest.current !== null && unsaved.current) retain(latest.current);
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Latest revision could not be loaded. Try again.",
      );
    }
  }

  async function discard() {
    if (!writesEnabled || saving.current) return;
    stopTimer();
    saving.current = true;
    setStatus("saving");
    try {
      await finishSettingsDraft(scopeKey, configuration.feature, "discarded");
      clearSettingsRecovery(scopeKey, configuration.feature);
      unsaved.current = false;
      await load();
      setMessage("Draft discarded");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Draft could not be discarded. Try again.",
      );
    } finally {
      saving.current = false;
    }
  }

  return {
    value,
    loading,
    status,
    message,
    conflict,
    dirty,
    writesEnabled,
    change,
    save,
    discard,
    reload,
    reloadRevision,
  };
}
