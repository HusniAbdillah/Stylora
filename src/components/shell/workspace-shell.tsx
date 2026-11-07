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
}: TopBarProps) {
  const feedback = draftStatus && draftFeedback[draftStatus];
  return (
    <header className="hidden min-h-11 items-center justify-between gap-4 text-control md:flex">
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
      <div className="flex shrink-0 items-center gap-4">
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
  breadcrumbs,
  activity,
  draftStatus,
  children,
}: TopBarProps & {
  activeHref: string;
  displayName: string;
  resume?: { href: string; label: string };
  children: ReactNode;
}) {
  const navigation = { activeHref, displayName, resume };
  return (
    <div className="min-h-dvh bg-canvas md:flex">
      <WorkspaceSidebar {...navigation} />
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
          />
          <main className="min-w-0 md:pt-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
