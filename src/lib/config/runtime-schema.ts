import { z } from "zod";

const httpsOrigin = z.url({ protocol: /^https$/ }).refine((value) => {
  const url = URL.parse(value);
  return url !== null && url.href === url.origin + "/";
}, "Expected an HTTPS origin");

const databaseConfigSchema = z.object({
  SUPABASE_URL: httpsOrigin,
  SUPABASE_SECRET_KEY: z.string().regex(/^sb_secret_[a-zA-Z0-9_-]+$/),
  STYLORA_WORKSPACE_ID: z.uuid(),
  DEMO_WRITES_ENABLED: z.enum(["true", "false"]).default("false"),
});

export function parseDatabaseConfig(
  env: Readonly<Record<string, string | undefined>>,
) {
  const result = databaseConfigSchema.safeParse(env);
  if (!result.success) return null;

  return {
    url: result.data.SUPABASE_URL,
    secretKey: result.data.SUPABASE_SECRET_KEY,
    workspaceId: result.data.STYLORA_WORKSPACE_ID,
    writesEnabled: result.data.DEMO_WRITES_ENABLED === "true",
  };
}
