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

Start with one supervised worker per workspace. It has three text slots and one
image slot, scanned independently. The database enforces the same shared limits
across Create, wardrobe description, Capsule and image consumers, including
multiple worker processes. Actual provider requests reserve their own slot and
UTC daily budget immediately before HTTP dispatch. Cached image reuse and
checkpoint restoration do not reserve a paid call. Operation attempts and
provider requests each remain bounded to three.

An active lease is never reclaimed. Expired running or partial jobs go through
the claim RPC, including exhausted attempts so the database can publish their
terminal state. New Create and generic leases last 280 seconds; provider work
has a shorter shared deadline within the route's 300-second budget. A stopped
worker waits for in-flight requests when gracefully signaled. An abrupt stop
requires lease expiry before recovery. Provider billing cannot be guaranteed
exactly once when the result of an interrupted request is unknown.

The scanner automatically defers explicitly retryable failures through an atomic
RPC. It retains operation identity, checks current inputs, stores exponential
backoff with jitter and honors provider Retry-After. The due timestamp survives
worker restarts. Busy claims do not consume attempts. Validation failures,
refusals, stale inputs and invalid configuration remain terminal for unchanged
inputs. Create and Capsule may each request one schema/domain
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

The worker verifies the app's workspace as well as its mode and secret. It writes
a scoped heartbeat every 15 seconds; new worker-mode allocations require one
within 90 seconds. A missing consumer returns 503 with a saved-draft message.
The protected GET `/api/internal/workflow-worker` reports executor mode,
workspace and consumer freshness. HTTP 202 still means acceptance, not task
completion. Alert on oldest queued age above 60 seconds, expired live leases,
repeated scan failures and exhausted budgets. A recent heartbeat is not a
completion guarantee. No host or application deployment is performed by these
repository changes.

Validated results are checkpointed before publication. On a lost commit or
response, recovery validates the same captured result and publishes it without
calling the model again. Image checkpoints retain verified pending assets until
publication. This cannot guarantee exactly-once billing when a provider response
is lost before a checkpoint can be written.

The database uses UTC daily limits. App and worker should share
`STYLORA_TEXT_DAILY_LIMIT=150`, `STYLORA_IMAGE_DAILY_LIMIT=20` and
`STYLORA_SEARCH_DAILY_LIMIT=100`, or explicitly chosen deployment quotas. Existing
recorded AI requests were conservatively charged to the migration's cutover day;
operation counters are not reset. Marketplace has its own atomic request budget.
Cache hits and score-weight changes do not spend another search request.

## Activate on a continuously running host

Vercel request handlers still require a separate consumer process. An example
systemd unit is in `ops/stylora-worker.service`; it is not installed automatically.
The hosted schema changes below are applied. App deployment and activation of
a supervised production consumer remain operational steps to complete.

1. Review and deploy the PR to the app with `STYLORA_EXECUTION_MODE=worker`, a
   dedicated random worker secret and the chosen quotas. Keep the same hosted
   workspace configuration on both processes. Do not reuse an OpenAI key as the
   worker secret.
2. Place this checkout and its installed production dependencies at
   `/opt/stylora` on a Node 22 host. Configure the service account `stylora`.
   Put server-only configuration in `/etc/stylora/worker.env`, readable only by
   the service account and administrators. Set `STYLORA_WORKER_ORIGIN` to the
   exact deployed HTTPS origin. Remove evaluation subject-file restrictions.
3. Install the example unit, then run `systemctl daemon-reload` and
   `systemctl enable --now stylora-worker`. Check `systemctl status` and
   `journalctl -u stylora-worker`. Its restart policy recovers a failed process;
   its shutdown allowance lets in-flight requests drain.
4. Verify the protected readiness response reports the expected workspace and a
   fresh worker, then allocate a small task. Navigate away and verify that it
   finishes once, with an asset or result reference. Monitor actual deployed
   latency and provider receipts before changing concurrency or quality.

Keep credentials out of command arguments, logs and client-visible variables.
The following migrations were applied to the configured hosted project during
this audit, in order:

1. `20261108044718_workflow_reliability.sql` — shared provider quotas, result
   checkpoints, retry scheduling and worker readiness.
2. `20261108050029_shopping_request_budget.sql` — marketplace request budgets.
3. `20261108052354_workflow_retry_code_compat.sql` — compatibility for recorded
   retry codes.
4. `20261108054402_preview_cached_image_claim.sql` — allow a verified cached
   Preview result to be claimed without reserving another image request.

The four new rollback-only policy suites passed on hosted PostgreSQL 17. All 15
SQL suites also passed on disposable PostgreSQL 16. Do not replay applied
migrations or reset the project.
Hosted schema application and local worker evidence do not establish an
activated production consumer. Record its readiness and completion checks after
the deployment steps above.

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
