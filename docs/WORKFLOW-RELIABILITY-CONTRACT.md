# Workflow reliability migration contract

Migration: `20261108042602_workflow_reliability.sql`. This is an additive contract
for the shared workspace executor. Application consumers must adopt its RPCs;
applying SQL alone does not move Capsule or image calls onto the shared ledger.

## Validated result checkpoints

`checkpoint_workflow_result(p_workspace_id uuid, p_operation_id uuid,
p_attempt integer, p_input_fingerprint text, p_result jsonb,
p_metadata jsonb default '{}')` returns an `operation_result_checkpoints` row.

The row contains `workspace_id`, `operation_id`, `input_fingerprint`, `kind`,
`result`, `metadata`, `prompt_version`, `schema_version`, `model`,
`created_attempt` and `created_at`. Its composite primary key is workspace,
operation and fingerprint. Versions and kind come from the operation.

Only an exact running or partial claim with an unexpired lease and no requested
cancellation may insert or replay a checkpoint. Results are objects up to
512 KiB; metadata is an object up to 16 KiB. Callers validate canonical schemas,
domain rules and captured dependencies before storing. This table stores
validated application results, never raw provider responses or image bytes.
An identical replay returns the original row. A changed result or metadata
raises `40001 / WORKFLOW_CHECKPOINT_MISMATCH`. Updates are forbidden. Operation
deletion cascades to its checkpoint.

Image results have exactly `{assetId, renderFingerprint}`. The asset must belong
to the workspace, use the private `previews` bucket and PNG MIME, and remain
pending or ready. The server must verify decoded bytes before this RPC: the
existing asset schema has no stored digest or dimensions that could establish
that proof inside SQL. Pending assets are retained until their atomic image
completion or explicit cleanup.

After claiming, consumers first read a checkpoint scoped to workspace, operation
and fingerprint. They revalidate its result against the captured inputs, then
attempt publication without reserving or calling the provider. A checkpoint
permits this recovery when the operation has already spent three provider
requests, while the three-claim attempt limit remains in force.

`finish_create_operation` retains its existing arguments. When a checkpoint
exists, both supplied result and metadata must match it exactly. The transaction
also locks and verifies the captured inspiration `draftId` before publishing.
A discarded, completed, missing or foreign draft supersedes the operation.
Legacy standalone looks with no associated inspiration draft remain supported;
an associated legacy draft must be active. Draft locking precedes look locking
to agree with upload attachment order. Terminal Create publication clears its
provider inflight count.

`finish_workflow_operation` derives `result_ref.checkpointed=true` from the
authoritative checkpoint table on failure. It does not trust a client marker.
The existing retry RPCs preserve checkpoints and permit commit-only recovery at
the paid request limit.

## Shared reservation and UTC daily budget

`reserve_workflow_provider_call(p_workspace_id uuid, p_operation_id uuid,
p_attempt integer, p_input_fingerprint text, p_text_daily_limit integer default
150, p_image_daily_limit integer default 20)` returns void. Call it immediately
before every actual HTTP request, including a bounded correction or transport
retry. Missing credentials and checkpoint replay must not reserve a request.

`release_workflow_provider_call(p_workspace_id uuid, p_operation_id uuid,
p_attempt integer, p_input_fingerprint text)` returns void. Release once in a
`finally` block for every successful reservation. A stale attempt cannot release
a newer attempt. Release never refunds daily or operation call counts because
provider billing may already have occurred.

The shared database lock enforces three live text claims and three inflight text
requests across the five Create kinds, wardrobe description and Capsule. Preview
and saved-avatar images share one live claim and one inflight request. Each
operation can reserve at most three provider requests across all attempts.
Marketplace keeps its separate search quota.

`reserve_create_provider_call`, `reserve_wardrobe_provider_call` and
`release_create_provider_call` retain their signatures and delegate to this
contract. Legacy reservations use the default daily limits. Consumers that use
custom limits must call the generic reservation and supply the same trusted
server configuration at claim and reserve. Limits accept text 1–100,000 and
image 1–10,000; they are not client input.

`workflow_provider_daily_budgets` stores `workspace_id`, UTC `budget_date`,
`text_calls`, `image_calls` and `updated_at`. Counts are atomic and never reduced
by retry, cancellation or release. On migration, existing recorded operation
counts are charged conservatively to the cutover UTC day. Their historical
request timestamps are unknown; this does not reconstruct per-day billing or
invent counts for previously unrecorded image calls. Existing operation counters
remain intact. A new UTC date has its own row, replacing the former lifetime
150-call stop.

Budget errors are `54000 / PROVIDER_OPERATION_BUDGET_EXHAUSTED` or
`54000 / PROVIDER_DAILY_BUDGET_EXHAUSTED`. Capacity is
`55P03 / PROVIDER_CAPACITY_BUSY`. Stale attempts and fingerprints use `40001`.

## Claims and automatic recovery

The former four-argument `claim_workflow_operation` is replaced without CASCADE by
one six-argument function. Its first four arguments are unchanged; optional
`p_text_daily_limit=150` and `p_image_daily_limit=20` follow. Existing four-argument
SQL and named PostgREST callers remain valid. There is no ambiguous overload.

Claim checks due time, shared live capacity and daily eligibility before
incrementing the attempt. Busy claims raise `55P03` without consuming an attempt.
A checkpoint bypasses paid-budget eligibility for commit-only recovery. Expired
leases clear old inflight state when reclaimed. Attempt counts are monotonic
fencing tokens and are never decremented or reset.

`workflow_operations.next_attempt_at` persists scheduling across worker restarts.
`defer_workflow_operation(p_workspace_id uuid, p_operation_id uuid,
p_attempt_count integer, p_input_fingerprint text, p_safe_error_code text,
p_retry_after_seconds integer default null)` returns the queued operation.

It accepts an exact live claim or its retryable failed state, checks current
subject revision and captured Create draft, cancellation, explicit safe error
allowlist, three-attempt limit and remaining paid budget or a checkpoint. It
retains operation identity and checkpoints. Retry-After is bounded to one day;
the scheduled delay is at least exponential backoff with jitter. Duplicate
deferral returns the existing schedule. Daily exhaustion waits until the next
UTC day. Claim enforces the stored timestamp even if a caller skips polling
filters. Failed validation, refusal, immutable mismatch and stale input are not
automatically retried.

The safe code allowlist includes transient provider/network/rate-limit errors,
HTTP 429 and selected 5xx codes, capacity and daily budget, and explicit
checkpoint or commit availability codes. `CHECKPOINT_UNAVAILABLE` must only
represent transient persistence failure, never fingerprint or immutable result
conflicts. `CHECKPOINT_COMMIT_PENDING` means a validated checkpoint exists.
Application consumers retain error classification responsibility. This is
bounded automatic retry, not exactly-once external billing after a process crash.

## Worker heartbeat and access

`record_workflow_worker_heartbeat(p_workspace_id uuid, p_worker_id uuid,
p_active_jobs integer, p_version text)` returns a `workflow_worker_heartbeats`
row with those values and server-generated `last_seen_at`. Its key is workspace
and worker UUID; active jobs range from zero to four. The app can read scoped
freshness using a 90-second threshold and inspect oldest queued age separately.
A heartbeat proves recent consumer activity, not that a particular result will
complete. Process supervision remains necessary.

All three new tables enable RLS and deny PUBLIC, anon and authenticated access.
RPCs use SECURITY INVOKER with an empty search path, fully scoped predicates and
service-role-only execution. Checkpoint updates are denied to the service role;
the insert RPC and server reads remain privileged. There is no browser database
client and no new authentication model.

## Verification and rollout

Local validation uses a task-owned disposable PostgreSQL 16.4 instance at
`127.0.0.1:55439`, database `stylora_reliability`. Supabase roles and the Storage
bucket catalog are local stubs; no storage objects or providers are involved.
Every checked-in migration is applied atomically in order. The standalone
`supabase/tests/workflow_reliability.sql` runs in one transaction and rolls back
all synthetic fixtures. It covers private access, shared cross-kind quotas,
daily limits, stale reservations/releases, immutable replay, count-three
commit-only recovery, active-draft publication, persisted backoff, old-worker
rejection, attempt exhaustion, heartbeat and cleanup cascade.

Types are generated by Supabase CLI 3.0.0 directly from that local database with
`supabase gen types --schema public --remote='postgresql://postgres@127.0.0.1:55439/stylora_reliability?sslmode=disable'`,
then formatted mechanically. The native generator uses `NonNullable<Json>` for
non-null JSON columns. This can require intentionally invalid test fixtures to
cross an explicit `unknown` boundary. Types are never hand-edited.

Hosted application is delegated to the coordinator after review. PostgreSQL 17,
hosted policy verification, generated-type comparison, app adoption and real
worker recovery remain separate rollout checks. Do not reset the hosted project
or treat local SQL tests as end-to-end provider evidence.
