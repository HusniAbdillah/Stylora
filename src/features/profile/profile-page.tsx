"use client";

import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui";
import { useWardrobeCounts } from "@/features/wardrobe/wardrobe-preview";
import { ProfileOverview, type ProfileOverviewProps } from "./profile-overview";
import { profilePreviewStore } from "./profile-preview";

type ProfileStatus = NonNullable<ProfileOverviewProps["status"]>;

export function ProfileLoading() {
  return (
    <div
      role="status"
      aria-label="Loading workspace profile"
      className="mx-auto max-w-[1096px] space-y-6 py-6"
    >
      <Skeleton className="h-12 w-72 max-w-full" />
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4 rounded-panel bg-paper p-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-11 w-full" />
        </div>
        <div className="space-y-4 rounded-panel bg-blush p-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      </div>
      <div className="rounded-panel bg-paper p-6">
        <Skeleton className="h-8 w-52" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-24" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const profile = profilePreviewStore.useValue();
  const ready = profilePreviewStore.useReady();
  const counts = useWardrobeCounts();
  const [fallbackDraft, setFallbackDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<ProfileStatus>("ready");
  const [errorMessage, setErrorMessage] = useState<string>();
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

  function changeName(name: string) {
    stopStatusTimer();
    setStatus("draftSaving");
    setErrorMessage(undefined);
    try {
      profilePreviewStore.set((previous) => ({ ...previous, draftName: name }));
      setFallbackDraft(null);
      saveTimer.current = setTimeout(() => setStatus("draftSaved"), 600);
    } catch {
      setFallbackDraft(name);
      setStatus("saveError");
      setErrorMessage(
        "This browser could not save the name draft. Try Save name.",
      );
    }
  }

  function saveName() {
    stopStatusTimer();
    const name = (fallbackDraft ?? profilePreviewStore.get().draftName).trim();
    if (!name) return;
    setStatus("saving");
    try {
      profilePreviewStore.set({ draftName: name, displayName: name });
      setFallbackDraft(null);
      setErrorMessage(undefined);
      setStatus("saved");
    } catch {
      setStatus("saveError");
      setErrorMessage(
        "Could not save the workspace name in this browser. Check available storage and try again.",
      );
    }
  }

  if (!ready) return <ProfileLoading />;

  return (
    <ProfileOverview
      displayName={fallbackDraft ?? profile.draftName}
      stats={{
        wardrobeItems: counts.activeOwned,
        savedCandidates: counts.savedCandidates,
        archivedItems: counts.archived,
      }}
      status={status}
      errorMessage={errorMessage}
      onDisplayNameChange={changeName}
      onSaveName={saveName}
      onRetry={saveName}
    />
  );
}
