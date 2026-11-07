import "server-only";
import { createClient } from "@supabase/supabase-js";
import { readDatabaseConfig } from "@/lib/config/server";

export function getWorkspaceDatabase() {
  const config = readDatabaseConfig();
  if (!config)
    throw new Error("Workspace database configuration is unavailable.");

  const client = createClient(config.url, config.secretKey, {
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
