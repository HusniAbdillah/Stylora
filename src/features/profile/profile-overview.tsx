"use client";

import { Button, Icon } from "@/components/ui";
import styles from "./profile.module.css";

export type ProfileStats = {
  wardrobeItems: number;
  savedLooks?: number;
  capsules?: number;
  activeShareLinks?: number;
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
  onDisplayNameChange: (name: string) => void;
  onSaveName: () => void;
  onRetry?: () => void;
};

export function ProfileOverview({
  displayName,
  stats,
  status = "ready",
  errorMessage,
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
            Shown in this browser’s sidebar. It labels this sample workspace; it
            is not an account.
          </p>
          <label>
            <span className={styles.srOnly}>Display name</span>
            <input
              value={displayName}
              onChange={(event) => onDisplayNameChange(event.target.value)}
              disabled={status === "loading" || status === "saving"}
              maxLength={80}
              autoComplete="off"
            />
          </label>
          <div className={styles.nameAction}>
            <Button
              variant="primary"
              type="submit"
              disabled={
                status === "loading" ||
                status === "saving" ||
                !displayName.trim()
              }
            >
              {status === "saving" ? "Saving…" : "Save name"}
            </Button>
            {(status === "saved" ||
              status === "draftSaving" ||
              status === "draftSaved") && (
              <span role="status">
                <Icon name={status === "draftSaving" ? "refresh" : "check"} />{" "}
                {status === "saved"
                  ? "Name saved in this browser"
                  : status === "draftSaving"
                    ? "Saving draft…"
                    : "Draft saved in this browser"}
              </span>
            )}
          </div>
        </form>
        <aside className={styles.scopeCard} aria-labelledby="scope-title">
          <h2 id="scope-title">About this workspace</h2>
          <ul>
            <li>
              <Icon name="user" /> One sample workspace, no login
            </li>
            <li>
              <Icon name="info" /> Changes are saved in this browser
            </li>
            <li>
              <Icon name="sparkle" /> Sample pieces are labeled in Wardrobe
            </li>
            <li>
              <Icon name="trash" /> Clearing browser data removes local edits
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
            <dd>{status === "loading" ? "—" : stats.wardrobeItems}</dd>
          </div>
          <div>
            <dt>Saved looks</dt>
            <dd>{status === "loading" ? "—" : (stats.savedLooks ?? "—")}</dd>
          </div>
          <div>
            <dt>Capsules</dt>
            <dd>{status === "loading" ? "—" : (stats.capsules ?? "—")}</dd>
          </div>
          <div>
            <dt>Active share links</dt>
            <dd>
              {status === "loading" ? "—" : (stats.activeShareLinks ?? "—")}
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
          {(stats.savedLooks == null ||
            stats.capsules == null ||
            stats.activeShareLinks == null) && (
            <> Other totals are unavailable in this browser preview.</>
          )}
        </p>
      </section>
    </section>
  );
}
