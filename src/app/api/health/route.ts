import { getConfigurationReadiness } from "@/lib/config/server";

export function GET() {
  const readiness = getConfigurationReadiness();

  return Response.json(
    readiness.databaseConfigured
      ? { data: readiness }
      : {
          error: {
            code: "WORKSPACE_CONFIGURATION_UNAVAILABLE",
            message: "Workspace configuration is unavailable.",
            retryable: false,
          },
        },
    {
      status: readiness.databaseConfigured ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
