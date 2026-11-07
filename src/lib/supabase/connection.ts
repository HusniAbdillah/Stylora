import "server-only";
import {
  getWorkspaceDatabase,
  WorkspaceAccessError,
  type WorkspaceDatabase,
} from "./server";

export async function checkWorkspaceConnection(context?: WorkspaceDatabase) {
  const database = context ?? getWorkspaceDatabase();
  const { data, error } = await database.client
    .from("workspaces")
    .select("id")
    .eq("id", database.workspaceId)
    .maybeSingle();

  if (error) {
    throw new WorkspaceAccessError(
      "WORKSPACE_CONNECTION_FAILED",
      "The workspace database could not be reached.",
    );
  }

  if (!data || data.id !== database.workspaceId) {
    throw new WorkspaceAccessError(
      "WORKSPACE_RESOURCE_NOT_FOUND",
      "The configured workspace is unavailable.",
    );
  }

  return { connected: true, writesEnabled: database.writesEnabled } as const;
}
