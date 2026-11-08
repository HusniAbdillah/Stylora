# Serverless deployment

This runbook targets Vercel Functions and Queues with hosted Supabase. It keeps
all application flows without an always-on worker host. The infrastructure can
fit the included quotas for a small eligible demo; OpenAI and marketplace
provider usage still need their own configured accounts and spending limits.
The queue integration is not a claim of completed Vercel deployment.

## Published limits checked on 8 November 2026

| Resource                    | Included limit or behavior                                                                                                | Consequence for Stylora                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Vercel Hobby Fluid Function | Maximum 300 seconds per invocation                                                                                        | Keep the existing 240-second provider deadline and publication margin         |
| Vercel Hobby Functions      | 4 active CPU hours, 360 GB-hours of provisioned memory and 1 million invocations                                          | Callback delivery and status reads share finite compute allowances            |
| Vercel Hobby Queues         | First 1 million API operations                                                                                            | Retries, lease renewal and acknowledgments also consume operations            |
| Queue metering              | Payloads use 4 KiB units; idempotent sends and push delivery with max concurrency cost twice the units for that operation | Send a small operation reference and retain database idempotency              |
| Supabase Free               | 500 MB database, 1 GB file storage, 5 GB egress and 5 GB cached egress                                                    | Keep generated media and operation history within storage and transfer quotas |

Sources: [Function limits](https://vercel.com/docs/functions/limitations),
[Fluid compute pricing](https://vercel.com/docs/functions/usage-and-pricing),
[Queue pricing](https://vercel.com/docs/queues/pricing) and
[Supabase pricing](https://supabase.com/pricing). Limits can change; confirm the
project's current dashboard allowances before release.

Hobby is for personal, non-commercial use under
[Vercel's published plan terms](https://vercel.com/docs/plans/hobby). Exceeding
included usage can pause service. Supabase Free projects can also pause after
low activity over a seven-day period; Cron is not a promise of continuous
availability. See [project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).
Complete feature coverage does not mean unlimited traffic or free AI inference.

## Production configuration

Use the reviewed application commit and locked dependencies. Enable Fluid
Compute for the Vercel project, retain the Node.js runtime and the queue
consumer's `maxDuration=300`, and deploy in `hnd1`. The consumer trigger must
target the actual source route in `vercel.json` using `type: "queue/v2beta"`.
That trigger makes the consumer private to Vercel's queue infrastructure;
do not add a second public executor endpoint as a substitute. See the
[official setup](https://vercel.com/docs/queues/quickstart).

Consumer privacy comes from the deployed trigger, not callback authentication
inside `handleCallback`. Stylora rejects missing queue configuration and refuses
callbacks in non-Vercel production, even with an explicit token override.
Configured local development remains available for protocol tests. Confirm the
deployed privacy boundary before release; it has not been exercised against a
live Vercel deployment. See
[consumer function security](https://vercel.com/docs/queues/concepts#consumer-function-security).

The current [Vercel configuration schema](https://openapi.vercel.sh/vercel.json)
accepts `maxConcurrency` inside each `queue/v2beta` trigger. That consumer-group
limit is different from the Function instance's `maxConcurrency` property.
Platform limits can reduce unnecessary deliveries; the database's shared three
text slots and one image slot remain authoritative across deployments and
consumer groups. Verify the configured platform limit after deployment.

The checked-in consumers are `src/app/api/queues/text/route.ts` for
`stylora-text` with concurrency three and `src/app/api/queues/image/route.ts`
for `stylora-image` with concurrency one. Both use a 300-second route budget
and SDK visibility. Their trigger retry interval is 30 seconds; the callback
can return a later persisted due time. Queue message retention is seven days.

Copy the keys from [.env.production.example](../.env.production.example) into
the Vercel Production environment and fill its empty values. It selects queue
mode and conservative starting quotas. The local
[.env.example](../.env.example) retains inline compatibility. The abbreviated
Production values below are configuration keys, not development credentials:

```dotenv
SUPABASE_URL=<approved hosted project URL>
SUPABASE_SECRET_KEY=<server-only project secret>
STYLORA_WORKSPACE_ID=<approved workspace UUID>
DEMO_WRITES_ENABLED=true
STYLORA_EXECUTION_MODE=queue
STYLORA_DISPATCH_SECRET=<dedicated random repair secret>
OPENAI_API_KEY=<provider key with its own spending limit>
OPENAI_TEXT_MODEL=gpt-6-luna
OPENAI_IMAGE_MODEL=gpt-image-2.6-flare
OPENAI_IMAGE_QUALITY=medium
STYLORA_TEXT_DAILY_LIMIT=50
STYLORA_IMAGE_DAILY_LIMIT=5
STYLORA_SEARCH_DAILY_LIMIT=30
SERPAPI_API_KEY=<configured marketplace provider key>
```

The runtime and compatibility template defaults remain 150 text, 20 image and
100 search requests per UTC day. The Production example overrides them to
50, 5 and 30; choose lower limits where needed. UTC daily counters persist in
the database, and redeployment does not reset them. Keep optional task overrides
and model quality consistent with the chosen template; actual captured settings
govern each operation. Queue configuration does not change visual or text schemas.
Do not set `STYLORA_WORKER_ORIGIN`, run `pnpm worker` or provision a VPS for the
queue deployment path.

The SDK uses Vercel OIDC automatically on the platform. Do not paste a local
short-lived `VERCEL_OIDC_TOKEN` into Production as a permanent credential. For
authorized local queue testing, the documented `vercel link` and
`vercel env pull` flow obtains local credentials. Protect the resulting local
file. [OIDC documentation](https://vercel.com/docs/oidc) describes token
lifetime and platform request context.

Queue readiness always requires a valid dedicated `STYLORA_DISPATCH_SECRET`,
including on Vercel. Platform identity additionally requires the Vercel runtime
and deployment ID, with automatic OIDC. A local CLI broker must use a loopback
URL and matching injected credentials. The explicit `STYLORA_QUEUE_TOKEN`
override requires an identified deployment; use it only for an authorized local
integration test, not as a substitute for linking the correct account and
project. Leave local overrides out of Production.

## SDK contract and local testing

The repository pins `@vercel/queue` to `0.11.0`. Its published declarations and
implementation were inspected alongside current official documentation:

- `send(topic, payload, options)` publishes a JSON-compatible reference. Use
  `retentionSeconds`, `delaySeconds` and `idempotencyKey` as appropriate.
- `handleCallback(handler, options)` returns a Web Request handler. Its
  `retry(error, metadata)` callback returns `{ afterSeconds }`,
  `{ acknowledge: true }` or `undefined`. This is not a `retryConfig` API, and
  `RetryableError` is not an exported queue error type.
- SDK visibility defaults to 300 seconds with automatic renewal. The raw API
  has a different 60-second default. Current SDK and pricing documentation allow
  retention up to seven days; Stylora's outbox reconciliation must use the same
  retention as publication. Publishing deduplication and delivery are separate.

See the [SDK reference](https://vercel.com/docs/queues/sdk) and the
[published package](https://www.npmjs.com/package/@vercel/queue/v/0.11.0).

The package's local broker path requires development mode, no deployment ID,
Vercel CLI at least `59.26.0`, and its injected `VERCEL_QUEUE_BASE_URL` and
`VERCEL_QUEUE_TOKEN`. An explicit `QueueClient({ token })` overrides the token;
the injected local token is not used against a different endpoint. Without a
selected broker, SDK development mode may send to the real queue service and
then invoke handlers locally. Offline tests must mock the SDK, and a local
server is not evidence of a deployed private callback.

## Activate the repair schedule

Apply the reviewed outbox migration and regenerate database types through the
Owner 1 workflow. Application builds do not apply migrations, create Vault
secrets or enable Cron. Use
`supabase/setup/activate_workflow_dispatch.sql` only after confirming the
project, workspace, deployed endpoint and dedicated secret.

The activation template requires the transaction-local setting
`stylora.activate_workflow_dispatch = 'true'` and checks the extensions, Vault
configuration and workspace. Review the script's guarded transaction example;
it creates the schedule, not the secrets. Generate the dedicated secret from
32 random bytes encoded as base64url, and retain the accepted 43-to-128
character format.

Vault names used by the setup are:

| Vault name                      | Value                                                     |
| ------------------------------- | --------------------------------------------------------- |
| `stylora_dispatch_url`          | Full deployed HTTPS `/api/internal/workflow-dispatch` URL |
| `stylora_dispatch_secret`       | Same dedicated value as `STYLORA_DISPATCH_SECRET`         |
| `stylora_dispatch_workspace_id` | Same approved workspace as the app                        |

The `stylora-workflow-dispatch` job runs once per minute. It reconciles outbox
state inside Postgres and makes an HTTP request only when a current row is due.
Idle minutes do not invoke Vercel. The endpoint publishes due operation
references; it does not perform model inference within the Cron HTTP request.
Supabase's [Cron](https://supabase.com/docs/guides/cron) can run SQL and HTTP
jobs. Vercel's legacy
[Hobby Cron](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing) is
limited to daily runs, so it is not the minute-level repair scheduler here.

Review the configured workspace's existing queued jobs before activation.
Migration bootstrap preserves their execution eligibility, so enabling delivery
can resume older requests. Cancel unwanted jobs through the normal operation
controls rather than deleting their history.

Store the repair secret through an approved secret entry mechanism, not in a
committed migration, command argument, screenshot or log. Use a dedicated
repair-only credential because `pg_net` temporarily stores decrypted request
headers in `net.http_request_queue`; database login roles can read them. Vault
protects the stored secret at rest, not the waiting HTTP header. See
[Supabase scheduled HTTP security](https://supabase.com/docs/guides/functions/schedule-functions).
Do not put the OpenAI or Supabase privileged key in that request.

Review `cron.job_run_details` and the associated `net` response metadata after
activation. A completed SQL job can mean only that asynchronous HTTP was queued.
The outbox acknowledgment and operation result establish later progress.
`pg_net` request and response tables are unlogged, so the durable outbox must
survive loss of an HTTP request. See
[`pg_net` behavior](https://supabase.com/docs/guides/database/extensions/pg_net).

## Release verification

`GET /api/health` reports `runtime.commit`, the image and text models, avatar
and Capsule prompt versions, and `executor.mode` with `executor.configured`.
Compare the commit with the source of the active Production deployment. Missing
runtime fields indicate that this diagnostic version is not being served.
Queue configuration is not proof of message delivery. A writing deployment
returns 503 when executor or model configuration is unavailable; read-only
browsing does not require an executor. No credentials are returned.

Fluid Compute is explicitly enabled in `vercel.json`. Its private queue triggers
must still appear in the actual deployment. A successful build or an updated
environment does not establish that the Production domain points to that build.

Record the environment, exact commit, commands, provider budget and cleanup in
[PROGRESS-NEW.md](PROGRESS-NEW.md). Run these checks against a dedicated test
workspace before changing the demo workspace:

1. Verify the schema, denied direct table access, workspace rejection and
   outbox lease-token policy. Verify invalid or unauthenticated repair requests
   cannot publish work.
2. Confirm the deployed trigger is private and that an operation allocated by
   the UI completes after the browser closes. A local worker completion does
   not verify this path.
3. Redeliver the same message while a claim is live and after success. Neither
   case should make another provider call or replace a committed result.
4. Interrupt publication after a validated checkpoint. Allow recovery and
   verify the same result reference with no extra provider call.
5. Simulate failed queue publication. Confirm the committed outbox survives and
   the due-only repair schedule eventually republishes it. Confirm idle ticks
   make no HTTP request and budget waits retain their due timestamp.
6. Check all Create, Capsule, Preview, saved-avatar and wardrobe operation
   kinds, plus the separate marketplace request path. Observe quotas, queue
   age, safe errors and cancellation; remove only run-owned fixtures.

Live Vercel callback delivery, OIDC authentication, Cron activation and this
deployed recovery matrix were not run by the documentation task. Local tests
and the earlier browser evaluation remain separate evidence.

## Change or stop execution

Stop new work and drain live database claims before changing execution mode.
For a controlled rollback, stop the repair schedule, retain outbox and operation
history, and switch to a tested compatibility mode. Do not delete queued rows
to clear a backlog or launch a parallel executor to bypass a live lease. Resume
from persisted status and checkpoints after fixing configuration or capacity.
