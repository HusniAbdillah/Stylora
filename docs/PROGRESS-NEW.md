# Stylora shared progress reporting

## Owner 2 live pipeline verification: 7 November 2026

- Branch: `o2/upload-outfit-backend`; integrated upstream through `a964962`, including the merged Profile/Preferences PR #6, Owner 3 backend, OpenAI defaults, capsule work and Owner 4's shared operation runner. The shared runner remains in `operations/server.ts`; Owner 2 handlers are in `operations/create.ts`.
- Implemented and live verified: signed inspiration upload and decoded-byte verification, parallel garment description and independent confidence review, correction persistence with 409 recovery, sample-backed matching, exactly three outfit directions, isolated regeneration, reload and paid-work deduplication.
- Actual E2E: `node scripts/test-owner2-pipeline.mjs` passed against hosted Supabase and OpenAI `gpt-6-luna`. The supplied JPEG produced 4 persisted pieces, 4 matches and 3 current options. Five provider operations completed, including regeneration. Verified look: `264ecc9a-02cf-4de9-a8af-c897202554db` in `dev-owner-2`.
- Provider evidence from the successful run: description 19,204 ms, confidence 10,078 ms, matching 16,559 ms, options 34,117 ms, regeneration 10,428 ms. These are actual provider request durations for this fixture, not latency guarantees. Prompt `stylora-fashion-v1`, schema `fashion-item.v1`, source and assembly hashes, request IDs and usage are persisted per operation.
- Problems found and solved: initial description output lacked per-field evidence; a second attempt exposed a scalar/list mismatch. The provider projection now structurally pairs each attribute with evidence and uses separate scalar/list schemas before canonical validation. Confidence evidence IDs/paths and input keys are constrained to supplied context. Failed attempts remain failed; none was converted to synthetic inference success.
- Profile and draft checks: the first hosted round-trip passed and restored original values. `node scripts/test-owner2-guards.mjs` passed 9 HTTP checks for disabled writes, invalid uploads without allocation, missing resources, concurrent CAS and name-only fingerprint stability, with profile restoration and no provider calls.
- Additional live checks: SSE replay after a stored event, stale-option rejection, deduplicated regeneration allocation and replayable cancellation passed without new provider calls. The reproducible runner is `node scripts/test-owner2-replay.mjs`.
- Database verification: complete `supabase/tests/foundation.sql` and `supabase/tests/owner2.sql` passed through Supabase MCP. Synthetic transactions rolled back. Checks cover RLS/direct-role denial, foreign workspace and parent rejection, stale attempts/completions, changed preference snapshots, request limits, cancellation and historical matches after wardrobe archival.
- Schema: restored the two Owner 3 migration files from hosted migration history; upstream later supplied the same statements. Owner 2 migrations `20261107041044` and `20261107041613` were created with the CLI, reviewed, applied through the connected Supabase migration tool and recorded under their hosted versions. Database types were generated from the hosted schema, not edited as a contract workaround.
- Local checks: `make fast` passed; final `make test` passed 105 tests across 22 files after integration through `a964962`; `pnpm build` passed again on that integration. A production-server HTTP smoke read the retained look with 4 pieces, 4 matches, 3 non-stale options and an available reference image, without provider calls. The production build traces include the Markdown prompt files. The named replay runner also passed four checks without provider calls.
- Usage: 10 actual provider HTTP requests were recorded across all diagnostic and successful runs, within the authorized 150-call budget. Seven operations succeeded overall; the final connected run accounts for five. Three initial failed operations retain safe diagnostic evidence. Image generation and shopping usage remained zero for this task.
- Fixture source and retention: real user-supplied inspiration JPEG and real OpenAI output. Only wardrobe inventory is explicit synthetic sample data, including correctly named design-library sample photos and honest missing-photo states. Three pipeline runs retained their test records in `dev-owner-2`, including failed-operation evidence; the demo workspace was not changed. The successful run's selected synthetic preferences and final results remain inspectable. Optional per-run cleanup is documented in `OWNER-2-BACKEND.md`.
- Remaining integration: frontend wiring and Owner 1's actual wardrobe intake/export; marketplace execution remains pending with committed option/slot IDs and missing briefs available. No search, image-generation or deployment request was made by Owner 2. Main's general model defaults are preserved; this task explicitly selects `OPENAI_MODEL=gpt-6-luna`.
- Delivery lane: B. PR #6 is merged. The pipeline PR requires human review before merge; no direct push to main or deployment is authorized by this work.
- Upstream schema gap: main PR #14 adds `20261107035901_operation_fencing.sql`, but hosted migration history does not contain it at the final synchronization checkpoint. Its migration and policy tests are retained. The types file was regenerated from the actual hosted schema, so uninstalled RPC declarations from that upstream increment are absent until Owner 1 applies its reviewed migration and regenerates types. Owner 2's applied RPCs and live-tested flow are available independently. No hosted completion claim is made for Owner 1's new image/operation RPCs.

## Owner 2 backend checkpoint: 7 November 2026

Owner 2 now owns the Profile and Preferences backend by explicit task assignment. The user also authorized the additive Owner 2 database contracts and hosted validation for the Create pipeline. Frontend and marketplace implementation are excluded from this task.

- Branch: `o2/profile-preferences-backend`, based on upstream `4fd5aba`; latest shared UI catalog retained.
- Implemented: scoped Profile and Preferences GET/PATCH APIs, canonical preference snapshots and fingerprints, revision-aware inspiration/preferences/profile drafts.
- Contract: existing `PreferencesDraft` DTO; `expectedRevision` on saves; name changes preserve the styling fingerprint. Supabase access remains server-only with no client workspace input.
- Local configuration: `OPENAI_MODEL=gpt-6-luna`; the existing model key is retained. Online tests override the original demo workspace with `dev-owner-2` and enable writes only in the test process.
- Checks: `make fast` passed; `pnpm exec vitest run src/features/preferences/schema.test.ts src/features/operations/drafts-schema.test.ts` passed, 8 tests.
- Hosted HTTP evidence: `node scripts/test-owner2-profile.mjs` passed save/reload of all preference groups, stale-write rejection, profile isolation, matching swatch validation, client workspace rejection, and draft create/restore/update/conflict/discard.
- Fixture and cleanup: synthetic profile and selections in `dev-owner-2`; original values restored, test drafts deleted. Revisions advance normally during restoration.
- Not run at this checkpoint: provider inference, Create pipeline E2E, production build, preview UI review. No frontend code changed. No inference success is claimed.
- Delivery: Lane B; pull request requires human merge review. Create pipeline and explicit sample inventory adapter follow in a dependent branch. Marketplace integration remains pending.

## Owner 1 operation contract, 7 November 2026

- Branch `o1/operation-fencing` adds migration
  `20261107035901_operation_fencing.sql` and SQL regression tests.
- Completion checks attempt, fingerprint, active lease and current subject
  revision. Terminal events commit with state. Discarded drafts and deleted
  capsules can reach a terminal state. Preview and saved avatars share one
  workspace image claim. Retry permits the agreed transient provider codes,
  preserves safe retry metadata and honors the retry delay.
- Image completion requires a scoped ready PNG asset in the previews bucket.
  Saved-avatar media attachment and operation completion share one transaction.
  Byte verification remains the server upload handler's responsibility.
- Validation used separate local databases in the existing Docker PostgreSQL
  container. The database's Storage bucket table was a schema fixture, so this
  validates SQL integrity and grants rather than live Storage behavior.
- Applied the baseline and additive migration with `psql -v ON_ERROR_STOP=1`.
  `supabase/tests/foundation.sql` and `supabase/tests/operation_fencing.sql`
  passed. Synthetic rows were rolled back. Cases include workspace rejection,
  stale attempts and fingerprints, expired leases, cross-kind image quota,
  retry delay, terminal errors, discarded and deleted subjects, and atomic
  avatar attachment.
- Supabase CLI 3 generates the database types from that isolated local schema.
  Its output includes computed-field metadata and differs from the earlier
  hosted generator format. No generated declarations were edited by hand.
- Hosted migration application, hosted policy tests and real provider image
  generation remain pending. The Capsule and studio-save transactions are a
  separate additive contract.

This is the reporting template for four owners and their coding agents. It is
filled during the build, not a report in itself. Product requirements are in
[PRD.md](PRD.md),
assignments in [TASK.md](TASK.md), and contracts in [TDD.md](TDD.md).

## 1. Reporting rules

1. Start by reading the latest shared snapshot and dependencies below. Read the
   applicable task IDs and PRD requirements before editing.
2. Update only your owner section and shared rows you can substantiate. Preserve
   another owner's evidence; add a dated correction rather than silently
   rewriting it.
3. Distinguish code written, integration connected, tests passed, live provider
   verified and UI reviewed. None implies the others.
4. Every completion claim needs a file or commit reference and actual
   verification evidence. Record exact commands, environment and results. Never
   mark an unrun test passed.
5. Record whether data is real provider output, a synthetic fixture, manual
   content or sample content. A mock transport error is not a successful real
   inference.
6. Report contracts before changing shared schemas, dependencies, CSS or shell.
   Name the owner needed and the exact deliverable that unblocks you.
7. Preserve secrets: no keys, signed URLs, personal payloads or full sensitive
   provider logs.
8. Include cleanup and remaining work. Do not commit, push, deploy or modify
   hosted data merely to make a progress row look complete. Git delivery
   follows the lanes in [WORKFLOW.md](WORKFLOW.md) section 10; deployment and
   hosted data changes need separate authorization.

## 2. Status vocabulary

| Status                  | Meaning                                                                          |
| ----------------------- | -------------------------------------------------------------------------------- |
| Not assessed            | No owner has inspected this requirement for the reported source revision.        |
| Planned                 | Contract and acceptance criteria are understood; implementation not started.     |
| In progress             | Work is being implemented; list the incomplete behavior.                         |
| Implemented, unverified | Code exists but required checks or runtime evidence are missing.                 |
| Integration pending     | Owned code exists but another consumer or contract is not connected.             |
| Blocked                 | A specific external decision or dependency prevents the next step; name it.      |
| Verified                | Required acceptance evidence is recorded for the exact revision and environment. |
| Failed verification     | A required check failed; include failure and next action.                        |
| Not run                 | A check was intentionally skipped or unavailable; give the reason.               |

Do not use percentages as substitutes for task-level evidence. A verified local
check is not automatically a verified hosted flow.

## 3. Shared checkpoint snapshot

Copy and fill this block at each checkpoint; retain earlier dated checkpoints
below the latest one.

| Field                                  | Value                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------- |
| Reported at and timezone               | Not reported                                                            |
| Reporter and owner                     | Not assigned                                                            |
| Branch and inspected HEAD              | Not reported                                                            |
| Base main revision                     | Not reported                                                            |
| Active requirement and task IDs        | Not reported                                                            |
| Working-tree changes outside this task | Not assessed                                                            |
| Environment                            | Local app, hosted Supabase, disposable test database, or other; specify |
| Git lane and deployment authorization  | Lane A or B per WORKFLOW section 10; deployment not granted             |
| Check restrictions                     | Record user instructions before running anything                        |
| Current shared integration blocker     | Not assessed                                                            |
| Next checkpoint                        | Not scheduled                                                           |

### Feature status board

| Flow                               | Accountable owner | PRD requirements | Status       | Evidence or blocker |
| ---------------------------------- | ----------------- | ---------------- | ------------ | ------------------- |
| Canonical items and preferences    | 1                 | R07–R09, R33–R36 | Not assessed | —                   |
| Shared shell and durable drafts    | 1 with 2          | R01–R03, R10–R11 | Not assessed | —                   |
| Landing                            | 2                 | R12–R14          | Not assessed | —                   |
| Upload and early parallel analysis | 2                 | R15–R17          | Not assessed | —                   |
| Streaming review and corrections   | 2                 | R18–R21          | Not assessed | —                   |
| Credible wardrobe matching         | 2                 | R22–R24          | Not assessed | —                   |
| Three directions and regeneration  | 2                 | R25–R27          | Not assessed | —                   |
| Integrated shopping and value      | 3                 | R28–R32          | Not assessed | —                   |
| Capsule wizard and combinations    | 4                 | R37–R40          | Not assessed | —                   |
| Category-based preview             | 4                 | R41–R43          | Not assessed | —                   |
| Save with automatic avatar         | 3 with 4          | R44              | Not assessed | —                   |
| Image-led public share             | 3                 | R45              | Not assessed | —                   |
| Durable worker and recovery        | 4 with 2          | R01, R04–R06     | Not assessed | —                   |

## 4. Owner 1 report

### Foundation checkpoint, 7 November 2026 (Asia/Bangkok)

- Scope: local App Router and Supabase setup, Node 22 and pinned pnpm, shared
  CSS tokens, feature directories and architecture. This prepares Owner 1's
  contract gate and the route entry points for the other owners.
- Source: `o1/nextjs-supabase-foundation` working tree. See
  [ARCHITECTURE.md](ARCHITECTURE.md) for the ownership map and proposed
  resolution for per-option selections, workspace roots and job execution.
- Local checks: `pnpm check` completed lint, route type generation, strict
  TypeScript and all three Vitest cases using synthetic configuration only.
- Build and smoke: `pnpm build` and `pnpm format:check` exited 0. With
  `next start --hostname 127.0.0.1` on ports 3413 and 3414, `GET /` returned
  200 in both runs. `GET /api/health` returned 503 with blank configuration
  and 200 with a synthetic configuration. Both responses used `no-store`.
  The smoke script stopped both server processes and wrote no fixture data.
- Supabase CLI: `supabase init` succeeded using the pinned 3.0.0 binary.
  `pnpm exec supabase --version` confirmed 3.0.0. The CLI help confirmed
  `--remote=<ref>` for hosted type generation. `pnpm db:types` with an empty
  project reference returned the expected exit code 1 and wrote no type file.
- Pending: Owner 1's reviewed baseline migration, workspace rows, private
  Storage, generated database types and policy tests. No hosted database,
  live provider, storage, Figma screen or Vercel verification was performed
  for this foundation.

### Owner 1 workspace frontend · 7 November 2026, Asia/Bangkok

- Work branch `o1/workspace-frontend`, base `4fd5aba`. Requirements R33–R36 and work packages O1.3–O1.6. The four application routes under `src/app/(workspace)` compose the shared shell, Wardrobe, Preferences and Profile.
- Wardrobe supports searching, filtering, returning to the collection, reading and editing details, marking a candidate owned, and archiving and restoring pieces. Each seeded example uses the same existing `/design/images/wardrobe-ivory-shirt.webp` thumbnail. The intake keeps selected files in IndexedDB. Users can save one or more manually described pieces from a photo, or try the labeled sample item.
- Preferences preserves optional selections and drafts across navigation and reload. Profile saves the workspace name shown in the sidebar and reads the active wardrobe count. The sample workspace keeps local navigation, item records, preferences and profile data in browser storage. Database persistence, automated descriptions and other owners’ routes remain separate integration work.
- Chrome checks used isolated browser contexts and a fixture selected from the repository. Verified filter restoration through item detail and the sidebar, candidate promotion, invalid-file rejection, photo and manual draft reload, two pieces sharing one file, editing, photo replacement, archive and restore, Activity, reset confirmation, and workspace-name propagation. Reviewed the grid and navigation at 1440, 768, 390 and 360 px. The test browser contexts were closed after inspection. No hosted data or provider calls were used.

- Final checks on Windows passed with `pnpm check` (ESLint, TypeScript and 37 tests), `pnpm build` and `pnpm build:storybook --quiet`. Both Chrome scenarios passed against the production build on loopback.

### Component library checkpoint · 2026-11-07, Asia/Bangkok

- Owner 1 coordinated shared presentation for all four owners on the working tree based on `82aa65b`. O1.3–O1.6 cover the Wardrobe, preference, profile, shell and ownership controls.
- Current Figma sources are pages 01 through 03, identified by stable node IDs 250:394, 250:395 and 250:396. The [library guide](../src/components/ui/README.md) maps desktop frame IDs to each feature entry point. The mobile variants share the same presentation contracts.
- UI delivered in `src/components/ui`, `src/components/shell` and `src/features` with locally bundled fonts and `public/design` assets. Brand colors and semantic roles are defined in `src/app/globals.css`. Storybook examples use labeled sample media and fixture data. Five alternate men's silhouettes were drawn locally to fill the documented gap in the Figma illustrations.
- Local checks on Windows: `pnpm check` passed lint, TypeScript and 3 existing tests. ESLint reported one warning in the existing PostCSS configuration. `pnpm build` completed using Next's Webpack builder. The default Turbopack builder exited while starting its PostCSS worker on this workstation. `pnpm build:storybook --quiet` generated the static component catalog.
- Browser verification: served the static catalog on loopback and loaded all 76 story iframes in Chrome at 390 and 1440 px. There were no failed image decodes or document-level horizontal scrollbars. Seven representative examples also passed at 360, 768 and 1280 px. Keyboard and pointer checks covered confirm-dialog dismissal and focus restoration, chip selection, desktop rail collapse, mobile navigation, candidate versus owned filtering and the empty-search result. The catalog and QA screenshots were generated locally in ignored output directories.
- Integration pending: feature routes, persisted selections, signed uploads, provider calls and the server-side Supabase backend. These checks exercised presentation callbacks and sample states. The local checks made no hosted data changes.

- Reporter and timestamp: Not reported.
- Source revision and task IDs: Not reported.
- Contract published: canonical items, preference mapping, candidate ownership,
  migrations and types; not assessed.
- Behavior implemented: Not reported.
- Files changed: Not reported.
- Consumers integrated: Owners 2, 3 and 4; not assessed.
- Verification evidence: Not run.
- Hosted schema changes and authorization: None reported.
- Unresolved work and next concrete action: Not reported.

### Wardrobe starter seed, 7 November 2026 (Asia/Bangkok)

- Task O1.6, PRD R33. Branch `o1/wardrobe-seed` from `4fd5aba`. Lane B
  because this change contains Storage and workspace-scoped seed code.
- Added `data/wardrobe/` with 45 unchanged WebP photographs, English item
  descriptions, evidence, source references and a usage README. Initial
  inventory is owned as requested. Source type stays sample.
- Added `scripts/seed-wardrobe.mjs` and four focused Vitest cases. The CLI
  reuses runtime configuration validation, checks the expected workspace and
  write gate, validates Zod records and hashes, fully decodes WebP, uses three
  concurrent tasks and random scoped Storage paths. Scoped import keys and
  stable UUIDs preserve existing records and resume incomplete assets.
  Stored descriptions use the source description text. User notes start empty.
- Authorized target was Stylora, workspace `dev-owner-1`. The repository env
  selected `demo`, so STYLORA_WORKSPACE_ID and DEMO_WRITES_ENABLED were
  overridden only for the seed process. The env file was untouched. Demo
  retained zero wardrobe items.
- Actual commands were `pnpm install --frozen-lockfile`, Prettier on the new
  files, `pnpm exec vitest run scripts/seed-wardrobe.test.mjs` (4 passed),
  `pnpm lint` and `pnpm typecheck` (both passed, equivalent to make fast).
  Node 22.14.0 ran the CLI with `--experimental-strip-types`, the local env
  file and `--expected-workspace dev-owner-1`.
- Hosted dry run planned 45 items with zero failures. First apply created 44
  and left one pending after a Storage download check failed. Second apply
  resumed it, created one and preserved 44. Third apply created zero, preserved
  45 and verified all 45 downloaded hashes with zero failures.
- Final scoped SQL confirmed 45 active owned items, 45 distinct ready assets,
  45 Storage objects and zero incomplete assets. Full-row fingerprints before
  and after the final apply matched. Intentionally retained the requested
  inventory. No synthetic online fixture or orphan remains.
- Read-only policy inspection confirmed RLS enabled and SELECT denied for
  anon and authenticated on assets and wardrobe_items. No schema, generated
  types, provider integration or other feature was changed.
- Not run were full check and production build, which are CI gates under
  WORKFLOW section 10.4. Wardrobe application and UI integration remain
  separate work.
- Automatic approval review rejected the commit command because authorization
  covered seeding, with separate permission required for Git-history changes.
  No commit, push or pull request was made. Files remain in the isolated
  worktree for review.

### Wardrobe post-seed audit, 7 November 2026 (Asia/Bangkok)

- A new read-only audit compared every supported database field against all 45
  source records, including canonical attributes, descriptions, inferred values,
  evidence, corrections, confidence, uncertainty, ownership and source type.
  All 45 matched. Each item linked to its scoped ready asset and Storage object.
- Downloaded, hashed and fully decoded all 45 stored WebPs. Every hash, size
  and dimension matched the local source. Total image bytes were 4,157,480.
  A temporary signed display URL returned HTTP 200, the expected MIME and
  identical bytes. The URL was not printed or stored.
- Independently read allowed attribute names and category groups from
  FASHION-STRUCTURE.md and checked actual list types, uniqueness, limits and
  field evidence. All 45 passed. Maximum PostgreSQL attribute JSON size was
  572 bytes and maximum provenance size was 5,556 bytes.
- All 45 persisted rows could be projected into schema-valid canonical
  fashion-item.v1 envelopes using real IDs, asset references and revisions.
  The source JSON is a seed manifest; its raw records require that projection.
  Source metadata and image context remain in the manifest. They are not
  dedicated fields in the existing wardrobe table.
- Environment discovery found configuration had moved from .env to .env.local.
  The audit used the latter and explicitly scoped all reads to dev-owner-1.
  No seed writes or schema changes were performed by this audit. The application
  response adapter and browser Wardrobe journey were not verified.

### Wardrobe dataset Git delivery, 7 November 2026 (Asia/Bangkok)

- The user authorized pulling updates and publishing the starter dataset to main.
  Rebased the isolated seed branch onto cb105ff without conflicts. The diff
  contains the 45 source WebPs, manifest, seed CLI, its tests and this report.
- New seed uploads now follow the shared Storage path contract using the asset
  ID as the middle path segment. Existing hosted paths still require the separate
  normalization task recorded in the Wardrobe backend plan. No hosted writes
  were performed during Git delivery.
- After rebase, the four targeted seed tests passed. Lint exited successfully
  with one existing Preview navigation warning. Typecheck failed at
  src/features/preview/generation.ts:262 because complete_preview_operation is
  missing from the generated RPC types. That file and the generated types are
  unchanged from main. Full check and build are delegated to the PR CI gate.
- Upstream 4971f04 supplied the missing RPC types while this branch was being
  prepared. Rebased onto that update and reran typecheck successfully.
- Formatted the task's new files with the current project formatter. Git delivery
  uses a pull request to main so the normal merge checks and protections apply.

## 5. Owner 2 report

- Reporter and timestamp: Not reported.
- Source revision and task IDs: Not reported.
- Contract published: upload, draft, streaming events, match and three-option
  payload; not assessed.
- Behavior implemented: Not reported.
- Files changed: Not reported.
- Consumer integration: Owner 1 inventory and preferences; Owner 3 selected
  detail; Owner 4 worker; not assessed.
- Verification evidence: Not run.
- Real OpenAI evidence and input provenance: Not verified.
- Unresolved work and next concrete action: Not reported.

## 6. Owner 3 report

- Reporter and timestamp: Not reported.
- Source revision and task IDs: Not reported.
- Contract published: search, selection, candidate import, immutable save and
  public media; not assessed.
- Behavior implemented: Not reported.
- Files changed: Not reported.
- Consumer integration: Owner 2 options; Owner 1 wardrobe import; Owner 4
  avatar; not assessed.
- Verification evidence: Not run.
- Real SerpAPI and share-revocation evidence: Not verified.
- Unresolved work and next concrete action: Not reported.

## 7. Owner 4 report

- Reporter and timestamp: Not reported.
- Source revision and task IDs: Not reported.
- Contract published: worker execution, capsule text inputs, category selection
  and avatar result; not assessed.
- Behavior implemented: Not reported.
- Files changed: Not reported.
- Consumer integration: Owner 1 schema; Owner 2 operation protocol; Owner 3 save
  outbox and media; not assessed.
- Verification evidence: Not run.
- Real text and image provider evidence: Not verified.
- Unresolved work and next concrete action: Not reported.

## 8. Task evidence ledger

Add one row per meaningful task, not one vague row for an entire owner.

| Task ID   | Requirement IDs | Expected behavior | Implemented files or commit | Contract version | Status       | Evidence reference | Next action                   |
| --------- | --------------- | ----------------- | --------------------------- | ---------------- | ------------ | ------------------ | ----------------------------- |
| To assign | To assign       | To specify        | None reported               | Not reported     | Not assessed | None               | Inspect and define acceptance |

## 9. Cross-owner integration ledger

| Producer → consumer | Contract                           | Input version | Consumer acknowledgment | Integrated revision | Verification | Blocker and owner |
| ------------------- | ---------------------------------- | ------------- | ----------------------- | ------------------- | ------------ | ----------------- |
| 1 → 2, 3, 4         | Canonical wardrobe and preferences | Not reported  | Pending                 | None                | Not run      | Not assessed      |
| 2 → 3               | Options, slots and revisions       | Not reported  | Pending                 | None                | Not run      | Not assessed      |
| 2 ↔ 4               | Job and replay protocol            | Not reported  | Pending                 | None                | Not run      | Not assessed      |
| 3 → 1               | Product-to-wardrobe candidate      | Not reported  | Pending                 | None                | Not run      | Not assessed      |
| 3 ↔ 4               | Save snapshot and avatar media     | Not reported  | Pending                 | None                | Not run      | Not assessed      |

## 10. Verification record template

### Check identifier: replace with a stable ID

- Requirement and task IDs:
- Date, reporter, branch and commit:
- Environment and data scope:
- Exact command or manual steps:
- Expected result:
- Actual result and exit code:
- Status: Passed, Failed, Not run, or Blocked.
- Data provenance: Live provider, synthetic fixture, manual, or sample.
- Provider and model; prompt and item schema versions:
- Safe operation or fixture IDs; no secrets or signed URLs:
- Evidence artifact or log location:
- Cleanup attempted and confirmed:
- Remaining limitation and next action:

### Connected-flow ledger

| Scenario               | Required checkpoints                                                                           | Status  | Evidence |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ------- | -------- |
| Create to saved look   | Upload → streamed review → correction → match → three directions → integrated shopping → save  | Not run | None     |
| Navigation restoration | Leave each feature, return, reload and switch options without losing state                     | Not run | None     |
| AI integrity           | Real output, valid IDs, honest empty wardrobe, strict sport-versus-formal rejection            | Not run | None     |
| Capsule                | Five templates → editable wizard → multiple combinations → reuse explanation → save or preview | Not run | None     |
| Preview and avatar     | Category selection → profile-aware image → save → media reload                                 | Not run | None     |
| Public share           | Approved media → public grid → expiry or revoke → access denied                                | Not run | None     |
| Recovery               | Timeout, partial stream, stale completion, duplicate enqueue, worker restart and retry         | Not run | None     |

## 11. Decision and blocker log

| ID        | Decision needed or blocker         | Impact                | Accountable owner | Proposed resolution | Status | Evidence or approval |
| --------- | ---------------------------------- | --------------------- | ----------------- | ------------------- | ------ | -------------------- |
| To assign | Specify the exact missing decision | Name blocked behavior | 1–4               | Concrete next step  | Open   | None                 |

## 12. Final handoff template

- Delivered behavior, with requirement IDs:
- Files and contracts changed:
- Integration completed and still pending:
- Checks passed with evidence:
- Checks failed:
- Checks not run and why:
- Real-provider, database and storage status:
- User-visible limitations:
- Test-data cleanup status:
- Migration, deployment or authorization still needed:
- Next owner and exact next action:
- Commit and push state:

A report is complete when another owner can resume from it without guessing
which data, code revision or provider behavior was verified.

## Foundation checkpoint: 7 November 2026, Asia/Jakarta

- Reporter: Codex coordinator with three authorized subagents (schema, Storage,
  runtime). Branch: `codex/supabase-foundation`; upstream base: `de6b255`.
- Task: approved Supabase foundation for all 25 TDD tables and Owner 3
  dependencies; relevant requirements R01, R07, R28–R32, R44–R45. Business HTTP
  endpoints and provider execution remain with their feature owners.
- Authorization: the user explicitly requested one hosted production migration
  through MCP, workspace bootstrap, and connection verification. No local
  Supabase stack, CLI login, AI call or shopping call was used.
- Applied migration: `20261107031037_initial_stylora_foundation` on the existing
  Stylora project. Exactly one baseline entry; 25 tables with RLS, zero direct
  anon/authenticated/PUBLIC table grants, three private 10 MiB buckets.
- Bootstrap: six environment workspaces and empty preference records, separate
  from the baseline. Runtime uses `demo`; Storage fixtures use `dev-owner-3` in
  the same hosted project. Local application writes remain disabled by default.
- Database evidence: `supabase/tests/foundation.sql` executed through MCP;
  access, foreign parents, candidate exclusion, per-option revision checks,
  atomic/idempotent snapshot with avatar operation, immutability and operation
  claims passed. All synthetic SQL fixtures rolled back.
- Runtime evidence: `corepack pnpm db:verify` passed configured-workspace and
  bucket checks. With explicit process-only write/workspace overrides,
  `corepack pnpm db:verify --write-storage` passed image round-trips and MIME
  rejection in all three buckets, invalid-bucket rejection, and verified cleanup.
- Unit evidence: one targeted Vitest run, four files and 34 tests passed.
- Generated types: unmodified MCP output from the applied schema, used by the
  existing server-only client. No hand-authored substitute types.
- Security advisor: only the expected informational `rls_enabled_no_policy`
  finding for 25 intentionally deny-all internal tables. See the
  [Supabase advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Code checks: `corepack pnpm lint`, `corepack pnpm typecheck` and
  `corepack pnpm build` passed. The initial typecheck found the existing
  `ProcessEnv`/`NODE_ENV` mismatch; upstream `de6b255` fixed it, and the final
  checks passed after synchronization. No full suite was repeated.
- Limits: helpers return verified upload metadata; domain attachment/ready
  promotion and pending-object reconciliation are future feature operations.
  Public sharing must recheck tokens and serve approved bytes rather than expose
  reusable signed URLs. Operations are persistence/claim primitives, not an
  autonomous executor. No feature-level provider success is claimed.
- Delivery: Lane B (schema, generated types, storage and shared server code).
  The user explicitly authorized PR creation and merge after green checks,
  including resolving conflicts. No branch-protection bypass or deployment.

## Owner 3 backend checkpoint: 7 November 2026, Asia/Jakarta

- Branch: `codex/owner3-backend`, based on merged foundation `f78c002`.
- Delivered: product search/cache/score/import and attach; per-option selection;
  immutable save, saved filters/counts/detail/delete/media retry; reviewed public
  shares, revocation and token-checked avatar/item bytes. Thin HTTP routes use
  server workspace scope, Zod, the write gate and safe no-store responses.
- Media generation belongs to Owner 4. Saved responses carry truthful queued,
  running, failed and succeeded states and nullable image URLs for the Figma
  placeholder. No generated image or autonomous worker is claimed.
- Two additive MCP migrations applied to the authorized hosted project:
  `20261107034005_owner3_backend_commands` and
  `20261107034035_share_revocation_guard`. The original baseline is unchanged.
  Types were regenerated from the applied schema.
- Passed: shared HTTP 3 tests, sharing 2, decisions 3, product score 3 and
  provider/import-boundary 15. Initial products tests required a Vitest alias
  configuration; the affected 15 tests passed after that fix. Lint and integrated
  typecheck passed. Local build not repeated; CI supplies the full build gate.
- Hosted command smoke passed retry identity, list filters, irreversible revoke
  after an image becomes unavailable, and atomic deletion. Fixtures rolled back.
- Live HTTP smoke passed real scoped detail, one SerpAPI search, cached restore,
  attach, selection, idempotent save with queued image operation, saved filters,
  public projection, revoke returning 404, and saved deletion. Provider calls: 1.
- Cleanup confirmed: synthetic look/saved records and Storage objects remaining: 0. Only the generated fixture and its unreferenced search products were removed.
  Runtime configuration file remains ignored; credential scan found no values.
- Not run: live candidate-image import, image generation, UI/browser comparison,
  deployment and local Supabase. Pure image import boundary tests passed.
- Handoff: `docs/OWNER-3-BACKEND.md` maps API data to D06, D14, D27, D15 and D16
  and identifies the Owner 1/2/4 integration points. No shared executor is implied.
- User authorized PR creation, conflict resolution and merge after green CI.
- Integration update: merged `origin/main` at `4fd5aba` (shared UI and Storybook)
  without conflicts. Frozen dependency install, lint and typecheck passed again.
  These UI components remain presentation contracts; application wiring is not
  claimed by the backend smoke.
- Latest user instruction supersedes the earlier merge authorization: open the
  PR and check CI, but leave the PR unmerged until explicitly requested.
- A second main update, `532a463` (profile, preferences and workflow drafts),
  also merged without conflicts. Its API routes use separate feature modules;
  the combined revision is submitted to the PR CI gate.
- PR #7 CI first passed lint/typecheck, then reported 67 passing tests and one
  failing IDR normalization test on Linux. ICU currency display defaults differ
  from Windows. Persisted IDR conversion now explicitly uses two minor digits,
  verified against the SIX ISO 4217 currency list. The focused provider suite
  passed all three tests, including a runtime-independent regression. CI rerun
  remains the final build gate; merge is held at the user's request.

## Owner 4 operation runner increment, 7 November 2026

- Task O4.1. The server runner starts and claims scoped operations, awaits execution, and delegates result commit to an atomic feature callback. Attempt count and input fingerprints fence failure updates. The caller must use a 300-second request duration.
- Source branch `o4/operation-runner`, core commit `06672fc`. Shared database contracts remain with Owner 1. No migrations or generated types were edited.
- Checks in the managed Windows worktree. `pnpm install --frozen-lockfile` passed. `make fast` passed lint and typecheck. Focused Vitest passed two files and four tests for stable fingerprints, strict inputs, status projection and in-flight request deduplication.
- Not run. Hosted database, Storage, provider calls, feature end-to-end journeys and local build. CI is the full build and test gate.
- Integration pending. Owner 1 atomic completion, workspace image claim quota and retry/cancel contracts. Current failure updates use a scoped attempt and lease compare-and-set. This is request execution with lease recovery on revisit.
- Client request store and operation HTTP controls are a following increment. No cloud data was changed.

## Owner 1 studio transactions, 7 November 2026

- Branch `o1/studio-transactions` adds the additive Studio transaction RPCs.
  Capsule drafts use expected revisions and idempotent creation. Generation
  commits validate the claimed attempt, stable brief, inventory and preference
  revisions, then save outfits, owned membership and proposed slots together.
- Studio saves resolve a Preview draft or Capsule outfit to an immutable
  snapshot, avatar operation and media row in one transaction. A completed
  Preview image can be reused only when source, render and dependency revisions
  match. Deleting the source preserves the snapshot.
- Capsule edits cancel obsolete operations and remove stale outputs before
  changing membership. Outfit deletion advances the parent and sibling source
  revisions, recomputes addition support and retains an explicit completed
  empty result when the final outfit is deleted.
- Ran the `studio_transactions.sql` suite as `service_role` using
  `psql -v ON_ERROR_STOP=1` against a separate local database containing the
  baseline, Owner 3 migrations and operation contract. It passed with fixtures
  rolled back. Cases include workspace rejection, stale attempts, input
  revision changes, candidate rejection, save idempotency, exact image reuse,
  deletion revisions and snapshot survival.
- Regenerated types from the combined local schema with pinned Supabase CLI 3.
  Hosted application, hosted policy checks and live provider journeys remain
  pending their existing authorization.
- The follow-up image lifecycle migration accepts a server-verified pending PNG
  and promotes it only with successful fenced completion. Superseded and
  cancelled results leave pending assets eligible for cleanup.
- Cancellation retains a running request's lease and image quota until worker
  acknowledgment or lease expiry. Queued cancellation remains immediate.
  Updated operation, Studio and foundation suites all passed against the
  combined local schema. Local lint and typecheck passed; CI is the build gate.
