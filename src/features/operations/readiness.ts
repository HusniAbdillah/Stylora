import "server-only";
import { z } from "zod";
import { readDatabaseConfig } from "../../lib/config/server";
import { OperationError } from "./errors";

export async function assertWorkflowRpc(name: string): Promise<void> {
  const rpcName = z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,80}$/)
    .safeParse(name);
  const config = readDatabaseConfig();
  if (!rpcName.success || !config) {
    throw new OperationError(
      "WORKFLOW_RPC_UNAVAILABLE",
      "This operation is waiting for database support.",
    );
  }
  try {
    const response = await fetch(`${config.url}/rest/v1/`, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: { apikey: config.secretKey, Accept: "application/openapi+json" },
    });
    if (!response.ok) throw new Error("OpenAPI unavailable");
    const definition = z
      .object({ paths: z.record(z.string(), z.unknown()) })
      .parse(await response.json());
    const path = z
      .object({ post: z.object({}).passthrough() })
      .safeParse(definition.paths[`/rpc/${rpcName.data}`]);
    if (!path.success) throw new Error("RPC unavailable");
  } catch {
    throw new OperationError(
      "WORKFLOW_RPC_UNAVAILABLE",
      "This operation is waiting for database support.",
    );
  }
}
