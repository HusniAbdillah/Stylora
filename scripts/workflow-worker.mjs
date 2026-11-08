import { createClient } from "@supabase/supabase-js";
import { setTimeout as delay } from "node:timers/promises";
import { readFileSync } from "node:fs";
import { parseDatabaseConfig } from "../src/lib/config/runtime-schema.ts";
import {
  workerOperationKinds,
  operationIsDue,
  operationLane,
} from "../src/features/operations/worker-policy.ts";

const config = parseDatabaseConfig(process.env);
const secret = process.env.STYLORA_WORKER_SECRET;
if (
  !config?.writesEnabled ||
  process.env.STYLORA_EXECUTION_MODE !== "worker" ||
  !secret ||
  !/^[A-Za-z0-9_-]{43,128}$/.test(secret)
)
  throw new Error(
    "Worker requires a writable workspace, worker execution mode and a dedicated secret.",
  );
const origin = new URL(
  process.env.STYLORA_WORKER_ORIGIN ?? "http://127.0.0.1:3000",
);
if (
  origin.username ||
  origin.password ||
  origin.search ||
  origin.hash ||
  origin.pathname !== "/" ||
  !(
    origin.protocol === "https:" ||
    (origin.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))
  )
)
  throw new Error(
    "Worker origin must be an HTTPS origin or local HTTP origin.",
  );
const endpoint = new URL("/api/internal/workflow-worker", origin);
const headers = {
  Authorization: `Bearer ${secret}`,
  "Content-Type": "application/json",
};
const probe = await fetch(endpoint, {
  headers,
  redirect: "error",
  signal: AbortSignal.timeout(15_000),
});
if (!probe.ok || (await probe.json()).data?.executionMode !== "worker")
  throw new Error("Application does not accept this worker configuration.");
const client = createClient(config.url, config.secretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
const inflight = new Map();
const deferred = new Map();
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopping = true;
  });
// Evaluation runs can fence execution to journal-owned subjects. The file may
// grow while the worker runs; an empty allowlist never means unrestricted.
function allowedSubjects() {
  if (!process.env.STYLORA_WORKER_SUBJECTS_FILE) return null;
  const ids = JSON.parse(
    readFileSync(process.env.STYLORA_WORKER_SUBJECTS_FILE, "utf8"),
  );
  if (
    !Array.isArray(ids) ||
    ids.some((id) => typeof id !== "string" || !/^[a-f0-9-]{36}$/i.test(id))
  )
    throw new Error("Invalid worker evaluation allowlist.");
  return ids;
}
const limits = { text: 3, image: 1 };
let scanFailures = 0;
console.log(JSON.stringify({ event: "worker_started", lanes: limits }));
async function dispatch(row) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ operationId: row.id }),
      redirect: "error",
      signal: AbortSignal.timeout(295_000),
    });
    // Never print response bodies: they can contain private asset URLs or data.
    console.log(
      JSON.stringify({
        event: "operation_dispatched",
        operationId: row.id,
        kind: row.kind,
        httpStatus: response.status,
      }),
    );
    await response.body?.cancel();
    deferred.set(row.id, Date.now() + (response.ok ? 3_000 : 30_000));
  } catch {
    deferred.set(row.id, Date.now() + 30_000);
    console.error(
      JSON.stringify({
        event: "worker_connection_interrupted",
        operationId: row.id,
      }),
    );
  } finally {
    inflight.delete(row.id);
  }
}
while (!stopping) {
  try {
    const subjects = allowedSubjects();
    if (subjects?.length === 0) {
      await delay(1_500);
      continue;
    }
    const scans = await Promise.allSettled(
      ["text", "image"].map(async (lane) => {
        if (
          [...inflight.values()].filter((entry) => entry.lane === lane)
            .length >= limits[lane]
        )
          return [];
        let query = client
          .from("workflow_operations")
          .select("id,kind,status,lease_until,attempt_count,result_ref")
          .eq("workspace_id", config.workspaceId)
          .in(
            "kind",
            workerOperationKinds.filter((kind) => operationLane(kind) === lane),
          )
          .or(
            `status.eq.queued,and(status.in.(running,partial),lease_until.lte.${new Date().toISOString()})`,
          )
          .order("created_at")
          .limit(50);
        if (subjects) query = query.in("subject_id", subjects);
        const excludedIds = [
          ...new Set([
            ...inflight.keys(),
            ...[...deferred]
              .filter(([, until]) => until > Date.now())
              .map(([id]) => id),
          ]),
        ];
        if (excludedIds.length)
          query = query.not("id", "in", `(${excludedIds.join(",")})`);
        const { data, error } = await query.abortSignal(
          AbortSignal.timeout(15_000),
        );
        if (error) throw new Error("Worker scan unavailable");
        return data ?? [];
      }),
    );
    const scanFailed = scans.some((scan) => scan.status === "rejected");
    scanFailures = scanFailed ? scanFailures + 1 : 0;
    if (scanFailed)
      console.error(JSON.stringify({ event: "worker_scan_unavailable" }));
    for (const row of scans.flatMap((scan) =>
      scan.status === "fulfilled" ? scan.value : [],
    )) {
      if (
        stopping ||
        inflight.has(row.id) ||
        (deferred.get(row.id) ?? 0) > Date.now() ||
        !operationIsDue(row)
      )
        continue;
      const lane = operationLane(row.kind);
      if (
        [...inflight.values()].filter((entry) => entry.lane === lane).length >=
        limits[lane]
      )
        continue;
      const entry = { lane, promise: null };
      inflight.set(row.id, entry);
      entry.promise = dispatch(row);
    }
    for (const [id, until] of deferred)
      if (until < Date.now()) deferred.delete(id);
  } catch {
    scanFailures++;
    console.error(JSON.stringify({ event: "worker_scan_unavailable" }));
  }
  await delay(
    scanFailures
      ? Math.min(30_000, 3_000 * scanFailures)
      : inflight.size
        ? 1_500
        : 3_000,
  );
}
await Promise.allSettled([...inflight.values()].map((entry) => entry.promise));
console.log(JSON.stringify({ event: "worker_stopped" }));
