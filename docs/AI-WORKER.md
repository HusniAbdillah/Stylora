# AI operation execution

## Runtime contract

The application persists a stable operation before provider work. In `worker`
mode, Create, Capsule, Preview, wardrobe description and saved-image routes
acknowledge allocation or an existing job. The browser reads progress. A
separate Node process executes queued jobs and recovers expired leases through
the existing atomic claim RPC. Two consumers cannot execute the same live claim.
Results still pass Zod, domain validation and commit fencing.

Marketplace uses its separate search rows, request cache and three-slot provider
pool with a 15-second upstream deadline. It is not dispatched by this worker.
Saving a look and rendering its image remain independent transactions.

## Run locally

Use Node 22 and the installed dependencies. Export configuration in each process;
do not check secrets into files. The worker does not load `.env.local` itself.

1. Configure the same hosted development workspace and write gate in both
   processes. Never aim an evaluation at `demo`.
2. Set `STYLORA_EXECUTION_MODE=worker` and the same `STYLORA_WORKER_SECRET` in
   both. Generate a dedicated random 32-byte base64url secret (43 characters).
3. Start the app with `pnpm dev`. Set `STYLORA_WORKER_ORIGIN` to its exact origin,
   for example `http://127.0.0.1:3000`. Remote origins require HTTPS. Redirects
   are refused so the bearer secret cannot follow an external redirect.
4. Run `pnpm worker` in a second terminal. It verifies the protected executor
   configuration before scanning. Keep it running when the browser closes.

For a fenced evaluation, set `STYLORA_WORKER_SUBJECTS_FILE` to an external JSON
array of run-owned subject UUIDs. The file is reread each scan. An empty array
dispatches nothing. Without this variable, all eligible jobs in the configured
workspace may execute, including jobs created before the worker started.

## Concurrency and recovery

Run one worker process per workspace. It has three text slots and one image
slot, scanned independently so a long image queue does not block text jobs.
Database image claims are also limited to one per workspace. Create and
wardrobe provider calls retain their existing database call reservations.
Capsule's provider path lacks a database-wide text semaphore; multiple worker
processes can exceed its intended text concurrency. Do not horizontally scale
this worker until that quota is implemented.

An active lease is never reclaimed. Expired running or partial jobs go through
the claim RPC, including exhausted attempts so the database can publish their
terminal state. New Create and generic leases last 280 seconds; provider work
has a shorter shared deadline within the route's 300-second budget. A stopped
worker waits for in-flight requests when gracefully signaled. An abrupt stop
requires lease expiry before recovery. Provider billing cannot be guaranteed
exactly once when the result of an interrupted request is unknown.

The scanner does not retry failed jobs automatically. An eligible user retry
retains operation identity, checks current inputs, observes the stored retry
delay and preserves the three-attempt limit. Validation failures are terminal
for unchanged inputs. Create and Capsule may each request one schema/domain
correction inside a single attempt, with the same captured inputs, safe error
paths and a shared deadline. Refusals, incomplete output and uncertain network
failures do not enter this correction loop. Streamed provisional descriptions
are never silently replayed for correction.

## Operations

Supervise the worker with restart-on-failure on a continuously running host.
The app's worker secret and mode must match before accepting traffic. Monitor
`worker_started`, `operation_dispatched`, `worker_scan_unavailable` and
`worker_connection_interrupted` events, plus oldest queued age, expired leases,
attempt counts, safe failure codes, provider latency and token usage. Logs must
not include request payloads, signed URLs, provider text or credentials.

HTTP 202 means persisted acceptance, not completion or proof that a consumer is
healthy. The configuration probe verifies credentials and mode only. It is not
a heartbeat. An independently monitored process and queue-age alert are required
for production. No infrastructure is deployed by this repository change.

The checked-in Vercel region is `hnd1` (Tokyo), matching the current Supabase
project's `ap-northeast-1` location. This removes the default US region from
database-heavy routes after a future deployment. Verify actual placement and
response times after deployment; local timings do not prove that gain.
[Vercel regions](https://vercel.com/docs/regions) lists the region codes and
recommends placing functions close to the database.

To roll back before enabling the worker, keep `inline`. To stop worker mode,
stop new traffic, drain active worker requests, then switch the app to `inline`.
Do not start browser execution and a changed executor against an active lease.
Keep existing operations and results for status recovery.
