# Owner 2 backend handoff

This slice implements shared Profile and Preferences, inspiration drafts,
verified uploads, garment analysis, independent confidence review, wardrobe
matching, three outfit directions and single-direction regeneration. The user
assigned these backend responsibilities to Owner 2. Frontend wiring and
marketplace execution remain separate tasks.

## Runtime

Run `pnpm dev` with the existing server-only Supabase configuration and
`MODEL_API_KEY`. Set `OPENAI_MODEL=gpt-6-luna` for this assigned task; this explicit
choice overrides the general model default in the shared technical document.
Make and the Makefile are already available.

All HTTP routes return `{ data }` or a safe `{ error }` and use `no-store`.
All database operations derive their workspace from `STYLORA_WORKSPACE_ID`.
The write gate remains `DEMO_WRITES_ENABLED`; it is not authentication.
The application has one shared workspace and no login.

## Profile and preferences

- `GET /api/profile`; `PATCH /api/profile` with `expectedRevision` and nullable
  `displayName`.
- `GET /api/preferences`; `PATCH /api/preferences` with `expectedRevision` and
  the existing `PreferencesDraft` under `preferences`.
- Both share one database revision. Stale edits return 409. Each save preserves
  unrelated columns. `getPersonalizationSnapshot()` exports normalized selected
  choices, a deterministic fingerprint and the original storage snapshot from
  one read. The display name is excluded from fashion context and fingerprints.
- Swatch ID and hex must agree. Drafts permit incomplete selections; saved
  personalization omits skipped, unknown and unsure signals. Illustration
  groups identify selectable references, not inferred identity.

## Create HTTP sequence

1. `POST /api/workflow-drafts` with `featureKind: "inspiration"`.
2. `POST /api/inspiration/uploads` with `fileName`, `mimeType` and `byteSize`;
   upload the actual bytes to its transient signed URL.
3. `POST /api/inspiration/uploads/[assetId]/verify` with `draftId`,
   `expectedRevision` and optional `occasion`. Decoded bytes are checked before
   the database atomically attaches the ready asset to the draft and look.
4. Start `inspiration_description` and `inspiration_confidence` concurrently
   through `POST /api/workflow-drafts/[draftId]/operations`.
5. Read `GET /api/looks/[lookId]`. Save complete reviewed pieces through
   `PATCH /api/looks/[lookId]/pieces` with the current `expectedRevision`.
6. Start `wardrobe_match`, then `outfit_options` when matching has committed.
   Production inventory defaults to `inventoryMode: "live"`; the explicitly
   authorized temporary test path uses `inventoryMode: "sample"`.
7. Regenerate through
   `POST /api/looks/[lookId]/outfit-options/[optionType]/regenerate` with the
   look's `expectedRevision` and the current `expectedOptionId`. A stale card
   cannot start another paid regeneration after its replacement has committed.
   `execute: false` can allocate an operation before starting the request.

Operation creation accepts `{ kind, inventoryMode?, execute? }`. With
`execute: false` it returns a persisted operation identity for the caller to
retain before executing `POST /api/workflow-operations/[operationId]/execute`.
Without that flag, creation awaits execution. Read status through the operation
GET route. Retry and cancel have dedicated POST endpoints. The events GET route
supports SSE with a replay cursor and JSON polling using `?after=<sequence>`.

The caller starts eligible requests once saved inputs are stable and retains
request ownership across navigation. Routes await provider work; there is no
autonomous queue or detached promise. Expired leases allow a later request to
recover work. Completed schema-valid pieces are provisional until final commit.

## Fashion data and persistence

The request includes the actual complete `FASHION-PROMPT.md`, relevant handbook
chapters and schema projections. Exact Markdown copies are bundled for server
deployment; integrity tests compare them with `docs/`. Results record source
hashes, assembled prompt hash, model, provider request ID, usage and latency.

Description output requires evidence beside each emitted attribute, with
separate scalar and list contracts. The adapter validates and normalizes this
projection into `fashion-item.v1`; it does not guess missing evidence or coerce
unsupported values. Confidence review is independent and only cites supplied
image, occasion and selected preference references.

Functional gates precede matching scores and model explanations. Only active
owned inventory is eligible. The model cannot turn a rejected sports garment
into a formal substitute. Every outfit uses allowed item IDs and includes
reasons, evidence, differences and uncertainty. `from_wardrobe` is unavailable
when owned inventory cannot support it.

Database commits check the operation attempt, lease, current look inputs,
preference snapshot and inventory state. Result commits preserve the input
revision, allowing description and confidence to finish independently. Actual
edits advance revisions. Historical pieces and options are retained to preserve
other features' foreign keys; current options use `is_current = true`.

Provider accounting is persisted: at most three concurrent Owner 2 calls per
workspace, three actual HTTP attempts per operation and 150 calls per workspace
budget. Retryable network, 429 and eligible 5xx failures honor Retry-After and
bounded backoff. Invalid schemas, unavailable models and insufficient quota do
not silently fall back to samples.

## Wardrobe and marketplace integration

`listInventory()` is the isolated owned-inventory adapter. Sample mode selects
only explicit `source_type=sample` rows; live mode excludes them. It never falls
back after an error. Sample items without photographs return an unavailable
image; provided fixture photos retain their actual illustrated garment names.

Marketplace integration is pending. After an outfit commit, consumers receive
stable option and slot IDs, source revisions and canonical missing briefs.
Single-direction regeneration replaces that option identity while preserving
the other two and historical records. Owner 3 must use current option IDs and
their revision before searching, selecting or saving. No marketplace request
is made by this slice.
Consumers must also respect the returned preference and inventory staleness
metadata before starting new personalized work or saving a newly selected look.

## Verification commands

- `node scripts/test-owner2-profile.mjs`: hosted Profile/Preferences round-trip
  with restoration and draft cleanup.
- `node scripts/test-owner2-guards.mjs`: write gates, invalid upload rejection
  and concurrent profile revision checks; no provider calls.
- `node scripts/test-owner2-pipeline.mjs`: real hosted Storage/database and
  OpenAI against the provided inspiration JPEG, with explicit sample inventory.
- `node scripts/test-owner2-replay.mjs`: replay and stale regeneration guards
  against the retained completed pipeline, without new provider requests.
- `make fast`, `make test` and `pnpm build`: local and CI checks.
- `supabase/tests/foundation.sql` and `supabase/tests/owner2.sql`: execute each
  entire transaction in the approved hosted environment; fixtures roll back.

Pipeline tests intentionally retain their synthetic preferences, look, sample
wardrobe and results in `dev-owner-2` for inspection. Safe result references go
to ignored `.next/owner2-e2e.json`. Set `OWNER2_E2E_CLEANUP=true` when running the
suite to remove only that run's rows and objects and restore original settings.
Actual outcomes, failures and remaining integration work are recorded in
`PROGRESS-NEW.md`; commands listed here are not completion claims.
