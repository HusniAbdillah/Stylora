# AI operation execution

## Deployment modes

The serverless deployment path is `STYLORA_EXECUTION_MODE=queue`. Vercel Queues
invokes a private consumer function; Supabase retains operation state, claims,
checkpoints, provider budgets and a transactional dispatch outbox. This path
does not need a VPS, a laptop left running or a separate Node worker.

| Mode     | Executor                                              | Browser behavior                                 |
| -------- | ----------------------------------------------------- | ------------------------------------------------ |
| `queue`  | Vercel push consumer, with Supabase repair scheduling | Allocate once, then read progress                |
| `worker` | Separately running `pnpm worker` process              | Allocate once, then read progress                |
| `inline` | The allocating HTTP request                           | Await execution; recover through a later request |

Inline remains the compatibility default. An environment value alone does not
prove that a queue consumer or repair schedule is deployed. Follow
[SERVERLESS-DEPLOYMENT.md](SERVERLESS-DEPLOYMENT.md) before enabling queue mode.

Create description, confidence, matching, outfit ideas and regeneration,
wardrobe description, Capsule generation, Preview images and saved avatars use
the shared operation executor. Marketplace keeps its separate search rows,
request cache, three-slot pool and 15-second upstream deadline. It is not a
workflow queue kind. Saving a look and generating its image remain independent
transactions.

## Queue lifecycle

1. A workspace-scoped transaction persists the operation and dispatch outbox
   entry. Saved-avatar operations created by the save transaction use the same
   path. A committed job therefore retains dispatch intent even if its HTTP
   process exits before publishing.
2. A Next.js `after` callback attempts prompt dispatch after the allocation
   response. It claims due outbox entries and awaits publication of small
   operation references. The outbox and repair schedule survive loss of that
   callback. Queue messages contain no images, preferences, credentials or
   provider payloads. Token-fenced completion records publication or a delayed
   retry.
3. Vercel delivers each accepted message at least once to its private consumer.
   The consumer validates the message and workspace, then uses the existing
   database claim. Duplicate delivery cannot replace a live claim.
4. The feature executor validates current dependencies, captures the provider
   settings and reserves a provider slot and UTC daily budget immediately before
   the actual request. Cache reuse and checkpoint restoration spend no new
   provider call.
5. A validated result is checkpointed before the feature's atomic publication.
   Publication checks operation identity, attempt, fingerprint, source revision,
   cancellation and lease. A retry restores the same checkpoint before deciding
   whether another model request is needed.
6. Supabase Cron reconciles due work and calls the protected dispatch endpoint
   only when publication is needed. Idle ticks perform SQL without an HTTP
   invocation. The database remains the recovery source after queue expiry or a
   lost publication acknowledgment.

Queue publish deduplication supplements the database claim; it does not replace
it. Delivery count, operation attempts and paid requests are different counters.
An HTTP 202 response means accepted work, not a completed result. The browser
may close after allocation without becoming the executor.

## Claims, deadlines and retries

The database enforces three shared text-provider slots and one image-provider
slot per workspace across consumers. Each operation has bounded attempts and
provider requests. Configure the app's daily limits explicitly.
[.env.production.example](../.env.production.example) starts with 50 text,
5 image and 30 marketplace requests per UTC day for a small deployment. The
runtime defaults and compatibility template retain 150, 20 and 100. These are
application spending controls, not free provider allowances.

The route budget is 300 seconds, the database lease is 280 seconds and provider
work has a shorter shared deadline. Vercel's JavaScript queue SDK separately
defaults to a 300-second visibility lease and renews that lease while its handler
runs. SDK visibility renewal cannot extend the Function's execution limit.
Vercel Hobby with Fluid Compute supports at most 300 seconds per invocation.
See the [SDK reference](https://vercel.com/docs/queues/sdk) and
[Function limits](https://vercel.com/docs/functions/limitations).

Retryable provider and transport failures retain persisted backoff and
Retry-After. Daily budget exhaustion waits until the next UTC day. Refusals,
invalid configuration, invalid input and stale dependencies remain terminal for
unchanged inputs. Schema correction stays inside its bounded feature attempt
with the same captured input and deadline. Queue redelivery does not authorize
unbounded provider replay.

Dispatch transport retries are separate from paid retries. The outbox uses
60-second token-fenced leases and backoff capped at 15 minutes; its diagnostic
attempt counter saturates at 32 rather than abandoning a committed job. A
published generation still eligible after the seven-day message retention
window can be reconciled into a new generation. Completed, cancelled,
superseded and live-lease operations are not blindly re-executed.

An interrupted paid request whose response was lost before checkpointing may
have been billed. Neither Vercel delivery nor the application can guarantee
exactly-once provider billing in that case. The tested checkpoint-replay case is
narrower: a received and validated result survives a failed publication without
another paid request.

## Dispatch repair and security

`workflow_dispatch_outbox` has one current generation per operation and
workspace. Its privileged RPCs are `claim_workflow_dispatches`,
`finish_workflow_dispatch` and `reconcile_workflow_dispatches`. A late publisher
must present its matching lease token before changing the outbox row.

The repair endpoint `/api/internal/workflow-dispatch` uses the dedicated
`STYLORA_DISPATCH_SECRET`. Supabase Vault stores the full approved HTTPS endpoint,
the matching secret and the configured workspace. The setup script is
`supabase/setup/activate_workflow_dispatch.sql`. Run it only after reviewing the
migration, deploying the app and confirming the intended workspace. Application
deployment does not create Vault secrets or activate Cron automatically.

Vault encrypts stored secrets, but `pg_net` places decrypted HTTP headers in
`net.http_request_queue` until sending them. Supabase documents that database
login roles can read those waiting headers. Use only the dedicated repair
credential here. Keep OpenAI and Supabase privileged keys out of the Cron
request, migration text and queue payload. Restrict database login access and
do not expose Vault or `net` tables through the application. See
[scheduled HTTP security](https://supabase.com/docs/guides/functions/schedule-functions).

## Local development

Use Node 22 and the locked dependencies. For offline tests, mock the queue SDK;
do not treat a local Next.js server as an offline queue emulator. The pinned
SDK can use a CLI-managed local broker, but other local configurations may
publish to the real Vercel service. Authentication and local broker differences
are recorded in [SERVERLESS-DEPLOYMENT.md](SERVERLESS-DEPLOYMENT.md).

The existing Node worker remains useful for a controlled local evaluation:

1. Give the app and worker the same hosted development workspace and write gate.
   Never aim fixture work at `demo`.
2. Set `STYLORA_EXECUTION_MODE=worker` and the same dedicated random 32-byte
   base64url `STYLORA_WORKER_SECRET` in both processes.
3. Start the app, set `STYLORA_WORKER_ORIGIN` to its exact local origin, then run
   `pnpm worker`. The worker does not load `.env.local` itself. Remote origins
   require HTTPS; redirects are refused.
4. For a fenced evaluation, set `STYLORA_WORKER_SUBJECTS_FILE` to an external
   JSON array of run-owned subject UUIDs. An empty array dispatches nothing.
   Without it, all eligible jobs in that workspace may run.

Worker mode requires a heartbeat within 90 seconds for new allocations. Queue
mode requires the dedicated dispatch repair secret and supported deployment
credentials instead of a worker-process heartbeat. This also applies on Vercel,
where OIDC is automatic. Neither readiness check proves a completed task. Drain
live claims before switching execution modes.

## Operations and evidence

Watch oldest due operation and outbox age, expired claims, publish failures,
queue redeliveries, attempts, provider counts, checkpoint restores and budget
exhaustion. Vercel's
[Queues observability](https://vercel.com/docs/queues/observability) shows message
age and redelivery metrics. Application logs must contain only safe codes and
operation metadata, without credentials, signed URLs or unrestricted content.

Keep `hnd1` consumers and publishers together beside the current Tokyo
Supabase project. Verify actual deployed placement and latency; local timing
does not establish a regional performance gain.

The earlier local worker, hosted claim/checkpoint migrations and recovery test
are recorded in [PROGRESS-NEW.md](PROGRESS-NEW.md). They do not prove a live
Vercel queue deployment. The serverless follow-up must record separately:
outbox policy checks, queue SDK tests, app build, authorized schema application,
Vault and Cron activation, deployed callback completion after browser closure,
and recovery after publication failure. Unrun checks remain unrun.
