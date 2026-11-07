import type { ReactNode } from "react";
import { createHash } from "node:crypto";
import { readDatabaseConfig } from "@/lib/config/server";
import { CreateWorkspaceProvider } from "@/features/inspiration/create-workspace";
import { OwnerWorkspace } from "./owner-workspace";

export function LiveWorkspace({ children }: { children: ReactNode }) {
  const config = readDatabaseConfig();
  const scopeKey = createHash("sha256")
    .update(config?.workspaceId ?? "unconfigured")
    .digest("hex")
    .slice(0, 16);
  return (
    <CreateWorkspaceProvider
      scopeKey={scopeKey}
      writesEnabled={config?.writesEnabled ?? false}
    >
      <OwnerWorkspace>{children}</OwnerWorkspace>
    </CreateWorkspaceProvider>
  );
}
