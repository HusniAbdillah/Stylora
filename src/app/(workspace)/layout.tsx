import type { ReactNode } from "react";
import { OwnerWorkspace } from "@/components/shell/owner-workspace";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <OwnerWorkspace>{children}</OwnerWorkspace>;
}
