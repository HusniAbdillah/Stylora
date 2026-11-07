"use client";

import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui";
import { PreferencesForm } from "./preferences-form";
import { preferencesPreviewStore } from "./preferences-preview";
import type { PreferencesDraft } from "./preferences-types";

type SaveStatus = "idle" | "draftSaving" | "saving" | "saved" | "error";

export function PreferencesLoading() {
  return (
    <div
      role="status"
      aria-label="Loading your style preferences"
      className="mx-auto max-w-[1096px] space-y-5 py-6"
    >
      <Skeleton className="h-12 w-72 max-w-full" />
      <Skeleton className="h-5 w-[38rem] max-w-full" />
      <div className="grid gap-5">
        {[0, 1, 2].map((section) => (
          <div key={section} className="space-y-5 rounded-panel bg-paper p-6">
            <Skeleton className="h-8 w-44" />
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {[0, 1, 2, 3, 4].map((item) => (
                <Skeleton key={item} className="aspect-square" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PreferencesPage() {
  const state = preferencesPreviewStore.useValue();
  const ready = preferencesPreviewStore.useReady();
  const [fallbackDraft, setFallbackDraft] = useState<PreferencesDraft | null>(
    null,
  );
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  function stopStatusTimer() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
  }

  function changeDraft(next: PreferencesDraft) {
    stopStatusTimer();
    setStatus("draftSaving");
    try {
      preferencesPreviewStore.set((previous) => ({ ...previous, draft: next }));
      setFallbackDraft(null);
      saveTimer.current = setTimeout(() => {
        setStatus("saved");
        setStatusMessage("Draft saved in this browser");
      }, 600);
    } catch {
      setFallbackDraft(next);
      setStatus("error");
      setStatusMessage(
        "This browser could not save your draft. Try Save preferences.",
      );
    }
  }

  function save() {
    stopStatusTimer();
    setStatus("saving");
    const draft = fallbackDraft ?? preferencesPreviewStore.get().draft;
    try {
      preferencesPreviewStore.set((previous) => ({
        ...previous,
        draft,
        saved: draft,
        revision: previous.revision + 1,
      }));
      setFallbackDraft(null);
      setStatus("saved");
      setStatusMessage("Preferences saved in this browser");
    } catch {
      setStatus("error");
      setStatusMessage(
        "Could not save preferences in this browser. Check available storage and try again.",
      );
    }
  }

  function reset() {
    stopStatusTimer();
    try {
      preferencesPreviewStore.set((previous) => ({
        draft: {},
        saved: {},
        revision: previous.revision + 1,
      }));
      setFallbackDraft(null);
      setStatus("saved");
      setStatusMessage("Preferences cleared in this browser");
    } catch {
      setStatus("error");
      setStatusMessage(
        "Could not clear preferences in this browser. Try again.",
      );
    }
  }

  if (!ready) return <PreferencesLoading />;

  return (
    <PreferencesForm
      value={fallbackDraft ?? state.draft}
      status={status}
      statusMessage={statusMessage}
      onChange={changeDraft}
      onSave={save}
      onReset={reset}
    />
  );
}
