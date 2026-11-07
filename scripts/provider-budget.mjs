import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseDatabaseConfig } from "../src/lib/config/runtime-schema.ts";

const caps = { text: 150, image: 20, search: 100 };
const operationSchema = z.object({
  kind: z.string(),
  attempt_count: z.number().int().nonnegative(),
});
const workspaceSchema = z.object({ id: z.uuid(), name: z.string() });

async function main() {
  const config = parseDatabaseConfig(process.env);
  if (!config) throw new Error("BUDGET_CONFIGURATION_UNAVAILABLE");
  const client = createClient(config.url, config.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const names = [1, 2, 3, 4].map((owner) => `dev-owner-${owner}`);
  const workspaces = await client
    .from("workspaces")
    .select("id,name")
    .in("name", names)
    .order("name");
  if (workspaces.error) throw new Error("BUDGET_WORKSPACES_UNAVAILABLE");

  for (const workspace of z.array(workspaceSchema).parse(workspaces.data)) {
    const byKind = new Map();
    let offset = 0;
    while (true) {
      const response = await client
        .from("workflow_operations")
        .select("kind,attempt_count")
        .eq("workspace_id", workspace.id)
        .order("id")
        .range(offset, offset + 999);
      if (response.error) throw new Error("BUDGET_OPERATIONS_UNAVAILABLE");
      const rows = z.array(operationSchema).parse(response.data);
      for (const row of rows) {
        const count = byKind.get(row.kind) ?? { operations: 0, attempts: 0 };
        count.operations += 1;
        count.attempts += row.attempt_count;
        byKind.set(row.kind, count);
      }
      if (rows.length < 1000) break;
      offset += rows.length;
    }
    const totals = { text: 0, image: 0, search: 0 };
    const counts = [...byKind].map(([kind, count]) => {
      const category = ["preview_image", "saved_avatar"].includes(kind)
        ? "image"
        : kind === "marketplace_search"
          ? "search"
          : "text";
      totals[category] += count.attempts;
      return { kind, category, ...count };
    });
    console.log(workspace.name);
    console.table(counts);
    console.table(
      Object.entries(totals).map(([category, attempts]) => ({
        category,
        attempts,
        cap: caps[category],
        aboveCap: attempts > caps[category],
      })),
    );
  }
  console.log(
    "Counts cover retained operations. Attempts include cached work; deleted history is excluded. Use provider usage records for billing totals.",
  );
}

main().catch(() => {
  console.error("Provider budget could not be read. Check the server configuration and database access.");
  process.exitCode = 1;
});
