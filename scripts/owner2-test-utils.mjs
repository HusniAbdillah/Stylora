import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { setTimeout as delay } from "node:timers/promises";

export const localEnv = {
  ...parseEnv(readFileSync(new URL("../.env.local", import.meta.url), "utf8")),
  ...process.env,
};
export const client = createClient(
  localEnv.SUPABASE_URL,
  localEnv.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export async function owner2Workspace() {
  const { data, error } = await client
    .from("workspaces")
    .select("id,name")
    .eq("name", "dev-owner-2")
    .single();
  if (error || data?.name !== "dev-owner-2")
    throw new Error("Owner 2 test workspace unavailable");
  return data.id;
}

export async function startTestServer(
  workspaceId,
  writesEnabled = true,
  port = 3102,
) {
  const env = {
    ...localEnv,
    STYLORA_WORKSPACE_ID: workspaceId,
    DEMO_WRITES_ENABLED: String(writesEnabled),
    OPENAI_MODEL: "gpt-6-luna",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--webpack",
      "--port",
      String(port),
    ],
    { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  // Keep server diagnostics in memory so failed checks cannot expose request data.
  let diagnostics = "";
  child.stdout.on("data", (chunk) => {
    diagnostics = (diagnostics + chunk).slice(-8000);
  });
  child.stderr.on("data", (chunk) => {
    diagnostics = (diagnostics + chunk).slice(-8000);
  });
  const base = `http://localhost:${port}`;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok)
        return {
          base,
          stop: () => child.kill(),
          diagnostics: () => diagnostics,
        };
    } catch {}
    if (child.exitCode !== null)
      throw new Error("Test server exited before readiness");
    await delay(500);
  }
  child.kill();
  throw new Error("Test server readiness timeout");
}

export async function api(base, path, method = "GET", body) {
  const response = await fetch(base + path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return { status: response.status, ...payload };
}
