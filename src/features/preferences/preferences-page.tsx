"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ConfirmDialog, Skeleton } from "@/components/ui";
import {
  preferencesClientSchema,
  readPreferences,
  savePreferences,
} from "./client-contract";
import { useLiveSettingsDraft } from "./live-settings-draft";
import { PreferencesForm } from "./preferences-form";
import type { PreferencesDraft } from "./preferences-types";
import { preferencesReturnHref } from "./return-href";
import styles from "./preferences.module.css";

const preferencesConfiguration = {
  feature: "preferences" as const,
  read: async () => {
    const snapshot = await readPreferences();
    return { value: snapshot.preferences, revision: snapshot.revision };
  },
  save: async (value: PreferencesDraft, revision: number) => {
    const snapshot = await savePreferences(value, revision);
    window.dispatchEvent(
      new CustomEvent("stylora:preferences-updated", {
        detail: {
          revision: snapshot.revision,
          fingerprint: snapshot.fingerprint,
        },
      }),
    );
    return { value: snapshot.preferences, revision: snapshot.revision };
  },
  parse: (payload: unknown): PreferencesDraft =>
    preferencesClientSchema.parse(payload),
  input: (value: PreferencesDraft) => ({
    featureKind: "preferences" as const,
    payload: value,
  }),
};

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

export function PreferencesPage({
  returnTo: destination,
}: {
  returnTo?: string;
}) {
  const router = useRouter();
  const settings = useLiveSettingsDraft<PreferencesDraft>(
    preferencesConfiguration,
  );
  const [discardOpen, setDiscardOpen] = useState(false);
  const returnTo = preferencesReturnHref(destination);

  if (settings.loading) return <PreferencesLoading />;

  if (settings.value === null) {
    return (
      <section className={styles.notice} role="alert">
        <h1>Preferences are unavailable</h1>
        <p>{settings.message}</p>
        <Button variant="secondary" onClick={() => void settings.reload()}>
          Retry
        </Button>
      </section>
    );
  }

  return (
    <>
      {returnTo && (
        <Button
          variant="quiet"
          className={styles.returnLink}
          disabled={["saving", "draftSaving", "error"].includes(
            settings.status,
          )}
          onClick={() => router.push(returnTo)}
        >
          {returnTo.startsWith("/preview")
            ? "Back to preview"
            : "Back to Create"}
        </Button>
      )}
      {!settings.writesEnabled && (
        <p className={styles.notice} role="status">
          This workspace is read-only. You can view preferences; changes are
          disabled.
        </p>
      )}
      {(settings.conflict || settings.status === "error") && (
        <div className={styles.notice} role="alert">
          <p>{settings.message}</p>
          {settings.conflict ? (
            <Button
              variant="secondary"
              onClick={() => void settings.reloadRevision()}
            >
              Reload latest revision
            </Button>
          ) : (
            <Button
              variant="secondary"
              disabled={!settings.writesEnabled}
              onClick={() => void settings.save()}
            >
              Retry save
            </Button>
          )}
        </div>
      )}
      {settings.dirty && settings.writesEnabled && (
        <div className={styles.draftActions}>
          <span>Your draft is separate from saved preferences.</span>
          <Button
            variant="quiet"
            disabled={settings.status === "saving"}
            onClick={() => setDiscardOpen(true)}
          >
            Discard draft
          </Button>
        </div>
      )}
      <PreferencesForm
        value={settings.value}
        status={settings.status}
        statusMessage={settings.message}
        readOnly={!settings.writesEnabled}
        onChange={settings.change}
        onSave={() => void settings.save()}
        onReset={() => void settings.save({})}
      />
      <ConfirmDialog
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title="Discard preference draft?"
        description="Your unsaved choices will be removed. Saved preferences stay in place."
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
