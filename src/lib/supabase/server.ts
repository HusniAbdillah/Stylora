import "server-only";
import { createClient } from "@supabase/supabase-js";
import { readDatabaseConfig } from "../config/server";
import type { Database } from "@/types/database";

export class WorkspaceAccessError extends Error {
  constructor(
    public readonly code:
      | "WORKSPACE_CONFIGURATION_UNAVAILABLE"
      | "WORKSPACE_WRITES_DISABLED"
      | "WORKSPACE_RESOURCE_NOT_FOUND"
      | "WORKSPACE_CONNECTION_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "WorkspaceAccessError";
  }
}

export function getWorkspaceDatabase() {
  const config = readDatabaseConfig();
  if (!config) {
    throw new WorkspaceAccessError(
      "WORKSPACE_CONFIGURATION_UNAVAILABLE",
      "Workspace database configuration is unavailable.",
    );
  }

  const client = createClient<Database>(config.url, config.secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return {
    client,
    workspaceId: config.workspaceId,
    writesEnabled: config.writesEnabled,
  };
}

export type WorkspaceDatabase = ReturnType<typeof getWorkspaceDatabase>;

export function requireWorkspaceWrites(context: { writesEnabled: boolean }) {
  if (!context.writesEnabled) {
    throw new WorkspaceAccessError(
      "WORKSPACE_WRITES_DISABLED",
      "Changes are disabled for this workspace.",
    );
  }
}

export function assertWorkspaceResource<T extends { workspace_id: string }>(
  resource: T | null | undefined,
  workspaceId: string,
): T {
  if (!resource || resource.workspace_id !== workspaceId) {
    throw new WorkspaceAccessError(
      "WORKSPACE_RESOURCE_NOT_FOUND",
      "The requested workspace resource is unavailable.",
    );
  }

  return resource;
}
