"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  profilePreviewStore,
  useWorkspaceName,
} from "@/features/profile/profile-preview";
import { getWardrobeCollectionHref } from "@/features/wardrobe/wardrobe-navigation";
import { usePreviewActivity } from "@/lib/preview/activity";
import { WorkspaceShell } from "./workspace-shell";

const sections = {
  "/wardrobe": "Wardrobe",
  "/preferences": "Preferences",
  "/profile": "Profile",
} as const;
const sectionPaths = Object.keys(sections);

export function OwnerWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const section =
    sectionPaths.find(
      (path) => pathname === path || pathname.startsWith(path + "/"),
    ) ?? "/wardrobe";
  const label = sections[section as keyof typeof sections];
  const hydrated = profilePreviewStore.useReady();
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
  return (
    <WorkspaceShell
      activeHref={pathname}
      destinationHrefs={{ "/wardrobe": wardrobeHref }}
      breadcrumbs={breadcrumbs}
      displayName={displayName}
      activity={activity}
      contextLabel="Sample workspace"
    >
      {children}
    </WorkspaceShell>
  );
}
