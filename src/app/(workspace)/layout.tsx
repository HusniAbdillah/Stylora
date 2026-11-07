import type { ReactNode } from "react";
import { LiveWorkspace } from "@/components/shell/live-workspace";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <LiveWorkspace>{children}</LiveWorkspace>;
}
