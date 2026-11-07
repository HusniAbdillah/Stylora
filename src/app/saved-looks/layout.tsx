import type { ReactNode } from "react";
import { LiveWorkspace } from "@/components/shell/live-workspace";

export default function SavedLooksLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <LiveWorkspace>{children}</LiveWorkspace>;
}
