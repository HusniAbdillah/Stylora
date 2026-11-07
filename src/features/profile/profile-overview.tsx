"use client";

import { Button, Icon } from "@/components/ui";
import styles from "./profile.module.css";

export type ProfileStats = {
  wardrobeItems: number | null;
  savedLooks?: number | null;
  capsules?: number | null;
  activeShareLinks?: number | null;
  savedCandidates?: number;
  archivedItems?: number;
};

export type ProfileOverviewProps = {
  displayName: string;
  stats: ProfileStats;
  status?:
    | "ready"
    | "loading"
    | "error"
    | "saving"
    | "saved"
    | "draftSaving"
    | "draftSaved"
    | "saveError";
  errorMessage?: string;
  statusMessage?: string;
  readOnly?: boolean;
  onDisplayNameChange: (name: string) => void;
  onSaveName: () => void;
  onRetry?: () => void;
};

export function ProfileOverview({
  displayName,
  stats,
  status = "ready",
  errorMessage,
  statusMessage,
  readOnly = false,
  onDisplayNameChange,
  onSaveName,
  onRetry,
}: ProfileOverviewProps) {
  return (
    <section className={styles.profile} aria-labelledby="profile-title">
      <p className={styles.breadcrumb}>Profile</p>
      <h1 id="profile-title">
        Workspace <em>profile.</em>
      </h1>
      {(status === "error" || status === "saveError") && (
        <div className={styles.error} role="alert">
          <Icon name="info" />
          <div>
            <strong>
              {status === "saveError"
                ? "Name could not be saved"
                : "Profile is unavailable"}
            </strong>
            <p>
              {errorMessage ??
                "We could not load the workspace profile. Try again."}
            </p>
          </div>
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              {status === "saveError" ? "Retry save" : "Retry"}
            </Button>
          )}
        </div>
      )}
      <div className={styles.topCards}>
        <form
          className={styles.nameCard}
          onSubmit={(event) => {
            event.preventDefault();
            onSaveName();
          }}
        >
          <h2>Display name</h2>
          <p>
            Shown on saved looks and as the owner of shared links. It is not an
            account.
          </p>
          <label>
            <span className={styles.srOnly}>Display name</span>
            <input
              value={displayName}
              onChange={(event) => onDisplayNameChange(event.target.value)}
              disabled={readOnly || status === "loading" || status === "saving"}
              maxLength={80}
              autoComplete="off"
            />
          </label>
          <div className={styles.nameAction}>
            <Button
              variant="primary"
              type="submit"
              disabled={status === "loading" || status === "saving" || readOnly}
            >
              {status === "saving" ? "Saving…" : "Save name"}
            </Button>
            {(status === "saved" ||
              status === "draftSaving" ||
              status === "draftSaved" ||
              (status === "ready" && statusMessage)) && (
              <span role="status">
                <Icon
                  name={
                    status === "draftSaving"
                      ? "refresh"
                      : status === "ready"
                        ? "info"
                        : "check"
                  }
                />{" "}
                {statusMessage ||
                  (status === "saved"
                    ? "Name saved to this workspace"
                    : status === "draftSaving"
                      ? "Saving draft…"
                      : "Draft saved")}
              </span>
            )}
          </div>
        </form>
        <aside className={styles.scopeCard} aria-labelledby="scope-title">
          <h2 id="scope-title">About this workspace</h2>
          <ul>
            <li>
              <Icon name="user" /> One shared workspace, no login
            </li>
            <li>
              <Icon name="info" /> Anyone with this app can see and change data
            </li>
            <li>
              <Icon name="sparkle" /> Use non-sensitive outfit photos and sample
              preferences
            </li>
            <li>
              <Icon name="link" /> Shared links can be turned off from each
              saved look
            </li>
          </ul>
        </aside>
      </div>
      <section
        className={styles.statsCard}
        aria-labelledby="profile-stats-title"
      >
        <h2 id="profile-stats-title">Your data at a glance</h2>
        <dl>
          <div>
            <dt>Wardrobe items</dt>
            <dd>
              {status === "loading"
                ? "Unavailable"
                : (stats.wardrobeItems ?? "Unavailable")}
            </dd>
          </div>
          <div>
            <dt>Saved looks</dt>
            <dd>
              {status === "loading"
                ? "Unavailable"
                : (stats.savedLooks ?? "Unavailable")}
            </dd>
          </div>
          <div>
            <dt>Capsules</dt>
            <dd>
              {status === "loading"
                ? "Unavailable"
                : (stats.capsules ?? "Unavailable")}
            </dd>
          </div>
          <div>
            <dt>Active share links</dt>
            <dd>
              {status === "loading"
                ? "Unavailable"
                : (stats.activeShareLinks ?? "Unavailable")}
            </dd>
          </div>
        </dl>
        <p className={styles.statsNote}>
          Wardrobe counts active owned pieces.
          {stats.savedCandidates != null && (
            <> Saved candidates: {stats.savedCandidates}.</>
          )}
          {stats.archivedItems != null && (
            <> Archived pieces: {stats.archivedItems}.</>
          )}
          {(stats.wardrobeItems == null ||
            stats.savedLooks == null ||
            stats.capsules == null ||
            stats.activeShareLinks == null) && (
            <> Unavailable totals could not be loaded from this workspace.</>
          )}
        </p>
      </section>
    </section>
  );
}
