"use client";

import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import Link, { useLinkStatus } from "next/link";
import { Button, Drawer, Icon, Logo } from "@/components/ui";
import { createPreviewStore } from "@/lib/preview/store";
import styles from "./shell.module.css";
import { useFeedback } from "@/lib/feedback/store";

export const workspaceLinks = [
  { href: "/create", label: "Create", icon: "plus" },
  { href: "/wardrobe", label: "Wardrobe", icon: "shirt" },
  { href: "/capsules", label: "Capsules", icon: "layers" },
  { href: "/preview", label: "Preview", icon: "image" },
  { href: "/saved-looks", label: "Saved looks", icon: "bookmark" },
  { href: "/preferences", label: "Preferences", icon: "sliders" },
] as const;

const availableDestinations = workspaceLinks.map(({ href }) => href);

function NavigationFeedback({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return (
    <span className={styles.navigationPending} data-pending={pending}>
      <span aria-hidden="true">
        <Icon name="refresh" size={14} />
      </span>
      <span className="sr-only" role="status">
        {pending ? `Opening ${label}` : ""}
      </span>
    </span>
  );
}

function DestinationLink({
  href,
  label,
  icon,
  active,
  rail,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: (typeof workspaceLinks)[number]["icon"];
  active: boolean;
  rail: boolean;
  onNavigate?: () => void;
}) {
  const [prefetch, setPrefetch] = useState(false);
  return (
    <Link
      href={href}
      prefetch={prefetch ? true : null}
      onMouseEnter={() => setPrefetch(true)}
      onFocus={() => setPrefetch(true)}
      onClick={onNavigate}
      title={rail ? label : undefined}
      aria-label={rail ? label : undefined}
      aria-current={active ? "page" : undefined}
    >
      <Icon name={icon} />
      <span className={styles.linkLabel} aria-hidden={rail || undefined}>
        {label}
      </span>
      <NavigationFeedback label={label} />
    </Link>
  );
}
const railPreference = createPreviewStore<boolean | null>(
  "navigation.rail",
  null,
  (value) => value === null || typeof value === "boolean",
);

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
  availableHrefs = availableDestinations,
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
        !availableHrefs.includes(link.href) ? (
          <span
            key={link.href}
            className={styles.unavailable}
            role="link"
            aria-disabled="true"
            aria-label={link.label + ", unavailable"}
            title={link.label + " is unavailable"}
          >
            <Icon name={link.icon} />
            <span className={styles.linkLabel} aria-hidden={rail || undefined}>
              {link.label}
            </span>
          </span>
        ) : (
          <DestinationLink
            key={link.href}
            href={destinationHrefs?.[link.href] ?? link.href}
            label={link.label}
            icon={link.icon}
            rail={rail}
            onNavigate={onNavigate}
            active={
              activeHref === link.href ||
              activeHref.startsWith(link.href + "/") ||
              (link.href === "/create" && activeHref.startsWith("/looks/"))
            }
          />
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
  const savedRail = railPreference.useValue();
  const [fallbackRail, setFallbackRail] = useState<boolean>();
  const rail = collapsed ?? fallbackRail ?? savedRail ?? tablet;
  const toggle = () => {
    const next = !rail;
    try {
      railPreference.set(next);
      setFallbackRail(undefined);
    } catch {
      setFallbackRail(next);
    }
    onCollapsedChange?.(next);
  };
  const navId = useId();
  const toggleLabel = rail ? "Expand navigation" : "Collapse navigation";
  return (
    <aside className={styles.sidebar} data-rail={rail}>
      <button
        type="button"
        className={styles.sidebarToggle}
        title={toggleLabel}
        aria-label={toggleLabel}
        aria-controls={navId}
        aria-expanded={!rail}
        onClick={toggle}
      >
        <Icon name="chevronDown" size={18} className={styles.sidebarChevron} />
      </button>
      <div className={styles.sidebarContent}>
        <div className={styles.brandRow}>
          <Link href="/" aria-label="Stylora home">
            <Logo markOnly={rail} />
          </Link>
        </div>
        <div id={navId} className={styles.destinations}>
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
          <span className={styles.profileLabel} aria-hidden={rail || undefined}>
            <strong>{displayName}</strong>
            <small>{contextLabel ?? "Shared workspace"}</small>
          </span>
        </Link>
      </div>
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
        <Link
          href="/"
          aria-label="Stylora home"
          className={styles.drawerBrand}
          onClick={close}
        >
          <Logo />
        </Link>
        <div className={styles.drawerLinks}>
          <Destinations
            activeHref={activeHref}
            onNavigate={close}
            availableHrefs={availableHrefs}
            destinationHrefs={destinationHrefs}
          />
        </div>
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
  href?: string;
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

export function ActivityMenu({
  items: supplied,
}: {
  items: readonly ActivityItem[];
}) {
  const feedback = useFeedback();
  const items = [
    ...feedback.map((item) => {
      const original = supplied.find(
        (entry) => item.id === `operation:${entry.id}`,
      );
      return {
        ...item,
        href: item.href ?? original?.href,
        onRetry: original?.onRetry ?? item.onRetry,
      };
    }),
    ...supplied.filter(
      (item) =>
        !feedback.some(
          (entry) =>
            entry.id === `operation:${item.id}` || entry.id === item.id,
        ),
    ),
  ];
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
        <header>
          <h2>Activity</h2>
          <p>Runs while you browse</p>
        </header>
        {items.length ? (
          <ul>
            {items.map((item) => (
              <li key={item.id} data-state={item.state}>
                <Icon
                  name={
                    item.state === "complete"
                      ? "check"
                      : item.state === "failed"
                        ? "info"
                        : item.state === "cancelled" ||
                            item.state === "superseded"
                          ? "x"
                          : "refresh"
                  }
                  size={16}
                />
                <div>
                  {item.href ? (
                    <Link href={item.href}>
                      <strong>{item.label}</strong>
                    </Link>
                  ) : (
                    <strong>{item.label}</strong>
                  )}
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
