"use client";

import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { Button, Drawer, Icon, Logo } from "@/components/ui";
import styles from "./shell.module.css";

export const workspaceLinks = [
  { href: "/create", label: "Create", icon: "plus" },
  { href: "/wardrobe", label: "Wardrobe", icon: "shirt" },
  { href: "/capsules", label: "Capsules", icon: "layers" },
  { href: "/preview", label: "Preview", icon: "avatar" },
  { href: "/saved-looks", label: "Saved looks", icon: "bookmark" },
  { href: "/preferences", label: "Preferences", icon: "sliders" },
] as const;

type NavigationProps = {
  activeHref: string;
  displayName: string;
  resume?: { href: string; label: string };
  availableHrefs?: readonly string[];
  destinationHrefs?: Readonly<Record<string, string>>;
  contextLabel?: string;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
};

function Destinations({
  activeHref,
  rail = false,
  onNavigate,
  availableHrefs,
  destinationHrefs,
}: Pick<
  NavigationProps,
  "activeHref" | "availableHrefs" | "destinationHrefs"
> & {
  rail?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Workspace destinations" className={styles.links}>
      {workspaceLinks.map((link) =>
        availableHrefs && !availableHrefs.includes(link.href) ? (
          <span
            key={link.href}
            className={styles.unavailable}
            role="link"
            aria-disabled="true"
            aria-label={link.label + ", unavailable in this preview"}
            title={link.label + " is unavailable in this preview"}
          >
            <Icon name={link.icon} />
            {!rail && link.label}
          </span>
        ) : (
          <Link
            key={link.href}
            href={destinationHrefs?.[link.href] ?? link.href}
            onClick={onNavigate}
            title={rail ? link.label : undefined}
            aria-label={rail ? link.label : undefined}
            aria-current={
              activeHref === link.href || activeHref.startsWith(link.href + "/")
                ? "page"
                : undefined
            }
          >
            <Icon name={link.icon} />
            {!rail && link.label}
          </Link>
        ),
      )}
    </nav>
  );
}

const tabletMedia = "(min-width: 768px) and (max-width: 1023px)";
function observeTablet(callback: () => void) {
  const query = window.matchMedia(tabletMedia);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

export function WorkspaceSidebar({
  activeHref,
  displayName,
  collapsed,
  onCollapsedChange,
  resume,
  availableHrefs,
  destinationHrefs,
  contextLabel,
}: NavigationProps) {
  const tablet = useSyncExternalStore(
    observeTablet,
    () => window.matchMedia(tabletMedia).matches,
    () => false,
  );
  const [local, setLocal] = useState<boolean>();
  const rail = collapsed ?? local ?? tablet;
  const toggle = () => {
    setLocal(!rail);
    onCollapsedChange?.(!rail);
  };
  const navId = useId();
  return (
    <aside className={styles.sidebar} data-rail={rail}>
      <div className={styles.brandRow}>
        <Link href="/" aria-label="Stylora home">
          <Logo markOnly={rail} />
        </Link>
        <button
          type="button"
          title={rail ? "Expand navigation" : "Collapse navigation"}
          aria-label={rail ? "Expand navigation" : "Collapse navigation"}
          aria-controls={navId}
          aria-expanded={!rail}
          onClick={toggle}
        >
          <Icon name="menu" size={18} />
        </button>
      </div>
      <div id={navId}>
        <Destinations
          activeHref={activeHref}
          rail={rail}
          availableHrefs={availableHrefs}
          destinationHrefs={destinationHrefs}
        />
      </div>
      {resume && !rail && (
        <Link className={styles.resume} href={resume.href}>
          <Icon name="sparkle" size={16} />
          {resume.label}
        </Link>
      )}
      <Link
        className={styles.profile}
        href="/profile"
        aria-current={activeHref === "/profile" ? "page" : undefined}
        aria-label="Workspace profile"
        title={rail ? displayName : undefined}
      >
        <Icon name="user" />
        <span hidden={rail}>
          <strong>{displayName}</strong>
          <small>{contextLabel ?? "Shared workspace"}</small>
        </span>
      </Link>
    </aside>
  );
}

export function MobileTopBar({
  activeHref,
  displayName,
  resume,
  activity,
  availableHrefs,
  destinationHrefs,
  contextLabel,
}: Pick<
  NavigationProps,
  | "activeHref"
  | "displayName"
  | "resume"
  | "availableHrefs"
  | "destinationHrefs"
  | "contextLabel"
> & {
  activity?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <div className={styles.mobileBar}>
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Icon name="menu" />
        </button>
        <Link href="/" aria-label="Stylora home">
          <Logo />
          {contextLabel && (
            <small className={styles.mobileCaption}>{contextLabel}</small>
          )}
        </Link>
        <div>{activity}</div>
      </div>
      <Drawer side="left" title="Workspace" open={open} onClose={close}>
        <Destinations
          activeHref={activeHref}
          onNavigate={close}
          availableHrefs={availableHrefs}
          destinationHrefs={destinationHrefs}
        />
        {resume && (
          <Link className={styles.resume} href={resume.href} onClick={close}>
            <Icon name="sparkle" />
            {resume.label}
          </Link>
        )}
        <Link
          className={styles.profile}
          href="/profile"
          onClick={close}
          aria-current={activeHref === "/profile" ? "page" : undefined}
        >
          <Icon name="user" />
          {displayName}
        </Link>
      </Drawer>
    </>
  );
}

export type ActivityItem = {
  id: string;
  label: string;
  detail?: string;
  state:
    | "queued"
    | "running"
    | "complete"
    | "failed"
    | "partial"
    | "cancelled"
    | "superseded";
  onRetry?: () => void;
};

export function ActivityMenu({ items }: { items: readonly ActivityItem[] }) {
  const panelId = useId();
  const attention = items.some((item) =>
    ["queued", "running", "partial", "failed"].includes(item.state),
  );
  return (
    <div className={styles.activity}>
      <button
        type="button"
        popoverTarget={panelId}
        aria-label={attention ? "Activity, updates available" : "Activity"}
        className={styles.bell}
      >
        <Icon name="bell" />
        {attention && <i aria-hidden="true" />}
      </button>
      <section
        popover="auto"
        id={panelId}
        className={styles.activityPanel}
        aria-label="Activity"
      >
        <h2>Activity</h2>
        {items.length ? (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <Icon
                  name={
                    item.state === "complete"
                      ? "check"
                      : item.state === "failed"
                        ? "info"
                        : "refresh"
                  }
                  size={16}
                />
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.detail ?? item.state}</small>
                </div>
                {item.onRetry && item.state === "failed" && (
                  <Button variant="quiet" onClick={item.onRetry}>
                    Retry
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>No recent activity</p>
        )}
      </section>
    </div>
  );
}
