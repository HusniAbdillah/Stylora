# Serverless workflow dispatch contract

`20261108075309_workflow_dispatch_outbox.sql` adds an atomic database outbox for
the nine AI operation kinds. Marketplace retains its separate request/cache
path. The outbox contains operation IDs and dispatch metadata, never images,
preferences, prompt text or provider output. It does not execute a model.

## Allocation and generations

`workflow_dispatch_outbox` has `id`, `workspace_id`, `operation_id`,
`dispatch_generation`, `is_current`, `state`, `due_at`, `lease_token`,
`lease_until`, `attempt_count`, `last_error_code`, `published_at`, `created_at`
and `updated_at`. Its FK to the scoped operation cascades on deletion. A unique
key covers workspace, operation and generation, and a partial unique index
allows one current generation per operation.

The operation transaction creates a pending generation when it inserts a queued
operation or changes its queued schedule. An execution claim schedules another
generation at lease expiry. A running-to-partial transition with the same lease
does not reschedule. Explicitly retryable failures schedule a wakeup respecting
Retry-After; the existing consumer decides whether and how to defer the operation.
Unconfigured, refusal, validation and exhausted paid failures are not redispatched.
Succeeded, cancelled and superseded rows retire their current generation.
Cancellation requested during running work retains lease-expiry recovery.

New generations mark older ones `is_current=false`; they do not pretend an unsent
message was published. A publisher can finish an older leased generation with
its own token, but it cannot change a newer generation. Provider metadata-only
updates leave dispatch identity unchanged. Dispatch scheduling never resets
operation attempts, provider request counts or daily usage.

## Publisher RPCs

`claim_workflow_dispatches(p_workspace_id uuid, p_limit integer default 10,
p_lease_seconds integer default 60)` returns outbox rows. Limits are 1–10 and
leases 15–300 seconds. It atomically selects due current pending or expired-lease
rows with `FOR UPDATE SKIP LOCKED`, increments the dispatch attempt count and
returns a fresh UUID lease token for each row. Healthy leases are not reclaimed.

`finish_workflow_dispatch(p_workspace_id uuid, p_outbox_id uuid,
p_lease_token uuid, p_success boolean, p_error_code text default null)` returns
the outbox row. Only its exact unexpired lease token can finish a claim. Broker
acknowledgement sets `state=published` and `published_at`. Failure sets pending
with exponential backoff and jitter capped at 15 minutes. Dispatch attempts
saturate at 32 and keep retrying while current and eligible; a transport outage
does not permanently strand queued work. This counter is independent of paid
provider budgets. Same-token repeated finish is idempotent until a newer claim
rotates the token. Safe error codes use uppercase letters, digits and underscores
and contain no response text, credentials or request payload.

Missing or foreign IDs raise `P0002`. Stale or expired tokens raise `40001`.
Invalid limits or unsafe error codes raise `22023`. All tables have RLS and deny
PUBLIC, anon and authenticated access. RPCs use SECURITY INVOKER, an empty search
path and service-role-only execution. The server supplies workspace identity;
HTTP callers cannot choose another workspace.

The composite-row due helper lives in `stylora_private.workflow_dispatch_due`,
with schema USAGE and function EXECUTE granted only to the service role. Keep it
outside exposed API schemas. A public function taking a table row becomes a
PostgREST computed column and would change table select types without changing
RPC row returns. Public-schema generation must not contain this helper.

## Consumer and repair

Publish `{operationId, dispatchId}` with dispatch UUID as broker idempotency key.
Before AI execution, verify the exact scoped dispatch ID, operation ID and
`is_current=true`. Old delivery is acknowledged without provider work. Then use
the existing operation claim and captured-input validation. Those database
fences remain authoritative for actual execution and result publication.

If execution remains queued because capacity or daily quota prevented its claim,
the consumer must broker-retry/reschedule or persist a changed `next_attempt_at`.
It must not acknowledge business completion and leave no future wakeup.
Retry/defer transitions and execution leases already create their next outbox
generation. Transport acknowledgement proves broker acceptance only.

`reconcile_workflow_dispatches(p_workspace_id uuid, p_limit integer default 100)`
returns the number repaired, with a 1–100 bound. It recreates missing current
dispatches for eligible legacy operations without provider calls. Queued rows
without a stored delay are due now; live leases remain due at expiry. Repeated
reconciliation is idempotent. A current published row still eligible after seven
days receives a fresh generation to recover expired/lost transport messages;
healthy recent published rows are not republished. Use the same seven-day broker
message TTL. Migration bootstrap reconciles up to 100 rows per workspace; repair
continues in bounded batches.

`supabase/setup/activate_workflow_dispatch.sql` is a reviewed activation template,
not an applied migration. It requires an explicit session activation setting and
pre-enabled Cron, pg_net and Vault. Vault names are `stylora_dispatch_url`,
`stylora_dispatch_secret` and `stylora_dispatch_workspace_id`. URL must be the
exact protected HTTPS `/api/internal/workflow-dispatch` route; workspace must
match server configuration. The secret is a dedicated random dispatch-only
`STYLORA_DISPATCH_SECRET`, never an OpenAI or Supabase secret key.

The `stylora-workflow-dispatch` minute job first reconciles using SQL. It issues
HTTP only when a current due dispatch exists. Idle ticks perform no network
request. pg_net queues requests until the transaction commits. Its queued
headers include decrypted bearer credentials and can be read by database login
roles; Vault does not remove that exposure. Limit the bearer to drain-only
capabilities, restrict database logins, rotate it independently and avoid logging
Vault values or HTTP request headers. See the official [Cron](https://supabase.com/docs/guides/cron),
[pg_net](https://supabase.com/docs/guides/database/extensions/pg_net) and
[Vault](https://supabase.com/docs/guides/database/vault) documentation.

## Verification and rollout

The rollback-only `supabase/tests/workflow_dispatch_outbox.sql` covers private
access, cross-workspace rejection, lease rotation and old-token rejection,
idempotent finish, saturated dispatch retries, unchanged paid counters, seven-day
repair, automatic execution-lease recovery, metadata loop prevention,
Retry-After, refusal exclusion, legacy reconciliation and cleanup cascade.
All 20 migrations and 16 policy suites passed on disposable PostgreSQL 16.4.
The outbox migration was applied to the approved hosted project as
`20261108075309`; its rollback-only policy suite passed there, and public types
were regenerated from that hosted contract. No test fixtures remained.
Cron/pg_net activation, configured Vault values, managed broker delivery and
deployed consumer execution remain release checks. No provider call was made
for the outbox integration.
