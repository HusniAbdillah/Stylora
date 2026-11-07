"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useWorkspaceName } from "@/features/profile/profile-preview";
import { getWardrobeCollectionHref } from "@/features/wardrobe/wardrobe-navigation";
import { usePreviewActivity } from "@/lib/preview/activity";
import { createPreviewStore } from "@/lib/preview/store";
import { WorkspaceShell } from "./workspace-shell";

const sections = {
  "/wardrobe": "Wardrobe",
  "/preferences": "Preferences",
  "/profile": "Profile",
} as const;
const availableHrefs = Object.keys(sections);
const railPreference = createPreviewStore<boolean | null>(
  "navigation.rail",
  null,
  (value) => value === null || typeof value === "boolean",
);

export function OwnerWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const section =
    availableHrefs.find(
      (path) => pathname === path || pathname.startsWith(path + "/"),
    ) ?? "/wardrobe";
  const label = sections[section as keyof typeof sections];
  const hydrated = railPreference.useReady();
  const wardrobeHref =
    hydrated && pathname !== "/wardrobe"
      ? getWardrobeCollectionHref()
      : "/wardrobe";
  const breadcrumbs =
    pathname === section
      ? [{ label }]
      : [
          { label, href: section === "/wardrobe" ? wardrobeHref : section },
          { label: "Item details" },
        ];
  const displayName = useWorkspaceName();
  const activity = usePreviewActivity();
  const collapsed = railPreference.useValue();
  const [temporaryRail, setTemporaryRail] = useState<boolean>();
  function toggleRail(value: boolean) {
    try {
      railPreference.set(value);
      setTemporaryRail(undefined);
    } catch {
      setTemporaryRail(value);
    }
  }
  return (
    <WorkspaceShell
      activeHref={pathname}
      availableHrefs={availableHrefs}
      destinationHrefs={{ "/wardrobe": wardrobeHref }}
      breadcrumbs={breadcrumbs}
      displayName={displayName}
      activity={activity}
      collapsed={temporaryRail ?? collapsed ?? undefined}
      onCollapsedChange={toggleRail}
      contextLabel="Sample workspace"
    >
      {children}
    </WorkspaceShell>
  );
}
