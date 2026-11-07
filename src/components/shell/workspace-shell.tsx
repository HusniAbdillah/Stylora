import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui";
import {
  ActivityMenu,
  MobileTopBar,
  WorkspaceSidebar,
  type ActivityItem,
} from "./workspace-navigation";

type Crumb = { label: string; href?: string };
type TopBarProps = {
  breadcrumbs: readonly Crumb[];
  activity: readonly ActivityItem[];
  contextLabel?: string;
  draftStatus?: "saving" | "saved" | "failed";
};

const draftFeedback = {
  saving: { text: "Saving draft", icon: "refresh" },
  saved: { text: "Draft saved", icon: "check" },
  failed: { text: "Draft could not be saved", icon: "info" },
} as const;

export function WorkspaceTopBar({
  breadcrumbs,
  activity,
  draftStatus,
  contextLabel,
}: TopBarProps) {
  const feedback = draftStatus && draftFeedback[draftStatus];
  return (
    <header className="hidden min-h-11 items-center justify-between gap-4 text-control md:flex">
      {breadcrumbs.length > 1 ? (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-2 text-muted">
            {breadcrumbs.map(({ label, href }, i) => (
              <li key={href ?? label} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden="true">›</span>}
                {href && i < breadcrumbs.length - 1 ? (
                  <Link href={href} className="hover:underline">
                    {label}
                  </Link>
                ) : (
                  <span
                    aria-current={
                      i === breadcrumbs.length - 1 ? "page" : undefined
                    }
                  >
                    {label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : (
        <span aria-hidden="true" />
      )}
      <div className="flex shrink-0 items-center gap-4">
        {contextLabel && (
          <span className="text-metadata text-muted">{contextLabel}</span>
        )}
        {feedback && (
          <span role="status" className="flex items-center gap-1.5 text-muted">
            <Icon name={feedback.icon} size={14} /> {feedback.text}
          </span>
        )}
        <ActivityMenu items={activity} />
      </div>
    </header>
  );
}

export function WorkspaceShell({
  activeHref,
  displayName,
  resume,
  availableHrefs,
  destinationHrefs,
  contextLabel,
  collapsed,
  onCollapsedChange,
  breadcrumbs,
  activity,
  draftStatus,
  children,
}: TopBarProps & {
  activeHref: string;
  availableHrefs?: readonly string[];
  destinationHrefs?: Readonly<Record<string, string>>;
  collapsed?: boolean;
  onCollapsedChange?: (value: boolean) => void;
  displayName: string;
  resume?: { href: string; label: string };
  children: ReactNode;
}) {
  const navigation = {
    activeHref,
    displayName,
    resume,
    contextLabel,
    availableHrefs,
    destinationHrefs,
  };
  return (
    <div className="min-h-dvh bg-canvas md:flex">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-field focus:bg-paper focus:p-3"
        href="#workspace-content"
      >
        Skip to content
      </a>
      <WorkspaceSidebar
        {...navigation}
        collapsed={collapsed}
        onCollapsedChange={onCollapsedChange}
      />
      <MobileTopBar
        {...navigation}
        activity={<ActivityMenu items={activity} />}
      />
      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-[91rem] px-4 pt-2 md:px-8 md:pt-6 xl:px-12">
          <WorkspaceTopBar
            breadcrumbs={breadcrumbs}
            activity={activity}
            draftStatus={draftStatus}
            contextLabel={contextLabel}
          />
          <main id="workspace-content" tabIndex={-1} className="min-w-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
