"use client";

import { useState } from "react";
import { Button, ConfirmDialog, Skeleton } from "@/components/ui";
import {
  profileDraftClientSchema,
  readProfile,
  saveProfile,
} from "@/features/preferences/client-contract";
import { useLiveSettingsDraft } from "@/features/preferences/live-settings-draft";
import { ProfileOverview, type ProfileStats } from "./profile-overview";
import styles from "./profile.module.css";

type ProfileValue = {
  displayName: string;
  stats: ProfileStats;
};

const unavailableStatistics: ProfileStats = {
  wardrobeItems: null,
  savedLooks: null,
  capsules: null,
  activeShareLinks: null,
};

const profileConfiguration = {
  feature: "profile" as const,
  read: async () => {
    const snapshot = await readProfile();
    return {
      value: {
        displayName: snapshot.displayName ?? "",
        stats: snapshot.stats
          ? {
              wardrobeItems: snapshot.stats.wardrobeItems,
              savedLooks: snapshot.stats.savedLooks,
              capsules: snapshot.stats.capsules,
              activeShareLinks: snapshot.stats.activeShares,
            }
          : unavailableStatistics,
      },
      revision: snapshot.revision,
    };
  },
  save: async (value: ProfileValue, revision: number) => {
    const snapshot = await saveProfile(value.displayName, revision);
    window.dispatchEvent(
      new CustomEvent("stylora:profile-updated", {
        detail: {
          displayName: snapshot.displayName,
          revision: snapshot.revision,
        },
      }),
    );
    return {
      value: { ...value, displayName: snapshot.displayName ?? "" },
      revision: snapshot.revision,
    };
  },
  parse: (payload: unknown, saved: ProfileValue): ProfileValue => ({
    ...saved,
    displayName: profileDraftClientSchema.parse(payload).displayName ?? "",
  }),
  input: (value: ProfileValue) => ({
    featureKind: "profile" as const,
    payload: { displayName: value.displayName },
  }),
};

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
  const settings = useLiveSettingsDraft<ProfileValue>(profileConfiguration);
  const [discardOpen, setDiscardOpen] = useState(false);

  if (settings.loading) return <ProfileLoading />;

  if (settings.value === null) {
    return (
      <section className={styles.error} role="alert">
        <div>
          <h1>Profile is unavailable</h1>
          <p>{settings.message}</p>
        </div>
        <Button variant="secondary" onClick={() => void settings.reload()}>
          Retry
        </Button>
      </section>
    );
  }

  const value = settings.value;
  const status =
    settings.status === "idle"
      ? "ready"
      : settings.status === "error"
        ? "saveError"
        : settings.status === "saved" && settings.dirty
          ? "draftSaved"
          : settings.status;

  return (
    <>
      {!settings.writesEnabled && (
        <p className={styles.notice} role="status">
          This workspace is read-only. You can view the profile; changes are
          disabled.
        </p>
      )}
      {settings.conflict && (
        <div className={styles.notice} role="alert">
          <p>{settings.message}</p>
          <Button
            variant="secondary"
            onClick={() => void settings.reloadRevision()}
          >
            Reload latest revision
          </Button>
        </div>
      )}
      <ProfileOverview
        displayName={value.displayName}
        stats={value.stats}
        status={status}
        statusMessage={settings.message}
        errorMessage={settings.message}
        readOnly={!settings.writesEnabled}
        onDisplayNameChange={(displayName) =>
          settings.change({
            ...value,
            displayName,
          })
        }
        onSaveName={() => void settings.save()}
        onRetry={() =>
          void (settings.conflict ? settings.reloadRevision() : settings.save())
        }
      />
      {settings.dirty && settings.writesEnabled && (
        <div className={styles.draftActions}>
          <span>Your name draft is separate from the saved display name.</span>
          <Button
            variant="quiet"
            disabled={settings.status === "saving"}
            onClick={() => setDiscardOpen(true)}
          >
            Discard draft
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title="Discard name draft?"
        description="Your unsaved name will be removed. The saved workspace name stays in place."
        confirmLabel="Discard draft"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setDiscardOpen(false);
          void settings.discard();
        }}
      />
    </>
  );
}
