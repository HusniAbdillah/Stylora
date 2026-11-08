# Shopping request budget

`20261108045620_shopping_request_budget.sql` follows the workflow reliability
migration. It does not change applied SQL or existing call history.

The migration adds `workflow_provider_daily_budgets.search_calls bigint not null
default 0` and `shopping_searches.provider_call_count integer not null default 0`.
Search counters are nonnegative; each search row can reserve at most three
requests. Previously unrecorded requests are not reconstructed from cache rows.

`reserve_shopping_provider_call(p_workspace_id uuid, p_search_id uuid,
p_daily_limit integer default 100)` returns void. Call it only immediately before
an actual marketplace HTTP request, after the shared query-cache lookup misses.
A cached result must not spend budget. The limit is trusted server configuration,
accepting 1–100,000, never client input.

The RPC locks the same workspace budget advisory key used by AI calls, verifies
a scoped running search and its current option revision, then atomically
increments its row counter and the workspace's UTC day search counter. Search,
text and image counts are independent. The UTC date is captured once for the
whole reservation so crossing midnight cannot split the increment.

No release or refund is required. A failed network attempt may already have
incurred provider cost, so its reserved request stays counted. The application
retains its local three-request pool; this migration adds a durable daily and
per-search budget, not a distributed concurrency semaphore.

Errors are `P0002 / SHOPPING_SEARCH_NOT_FOUND` for missing or foreign rows,
`40001 / SHOPPING_SEARCH_STALE` for nonrunning or superseded searches,
`54000 / SHOPPING_SEARCH_BUDGET_EXHAUSTED` and
`54000 / SHOPPING_DAILY_BUDGET_EXHAUSTED`. Invalid limits use `22023`.
The function is SECURITY INVOKER with an empty search path, service-role-only
execution and fully scoped reads and writes. Existing private-table RLS and
grants remain unchanged.

Interrupted running searches still require the application's timeout recovery:
mark them failed, then allocate an explicit new retry identity. Database budget
state never turns a stale cache row into an executor or silently retries a
request. An interrupted request still carries billing uncertainty.

The standalone `supabase/tests/shopping_request_budget.sql` runs under the
service role, temporarily uses a non-UTC timezone and rolls back its fixtures.
It checks public access denial, foreign scope, per-row and daily caps, unchanged
counters after rejection, current parent revision and independent AI counters.
Local validation uses disposable PostgreSQL 16.4. Types are generated through
Supabase CLI 3.0.0 from that database with both additive migrations present.
Hosted review, application integration and real provider verification belong to
the coordinator; this slice does not execute them.
