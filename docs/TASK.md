# Stylora delivery tasks

All features in [PRD.md](PRD.md) are required within the seven-hour, four-person
delivery. This is an implementation task map, not a completion report. Use
[PROGRESS-NEW.md](PROGRESS-NEW.md) for actual status and evidence. Technical
details and proposed contracts are in [TDD.md](TDD.md). The time-boxed
checklist, merge windows, environment rules and Figma frame assignments for
each owner are in [WORKFLOW.md](WORKFLOW.md).

## 1. Ownership

| Owner   | Accountable features                                                                                                                                                                | Primary code areas                                                                                                                                    |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner 1 | Wardrobe CRUD and image-first intake; Preferences and Profile; canonical item and profile persistence; shared foundations; migrations and generated types                           | `src/features/wardrobe`, `preferences`, `profile`; shared shell, root CSS and layout; env, package and lockfile; `supabase`; generated database types |
| Owner 2 | Landing; Create draft and stepper; inspiration upload; streaming description and confidence review; review corrections; wardrobe matching; three outfit directions and regeneration | `src/app/page.tsx`; `src/features/inspiration`, `matching`; inspiration recommendation services; related routes                                       |
| Owner 3 | Selected outfit; integrated marketplace and Value Score; product selection; candidate-to-wardrobe import; immutable saves; saved collection and Social Fit                          | `src/features/products`, `decisions`, `sharing`; selected, saved and public routes                                                                    |
| Owner 4 | Capsule Studio and all preview experiences; category selection; visual generation and saved-avatar execution                                                                        | `src/features/capsules`, `preview`; capsule combination services in `outfits`; image provider and job integration                                     |

Owner 1 is the sole migration and generated-type owner. Owner 1 coordinates root
CSS, layout, env, dependencies and lockfile changes. Owner 2 owns the reusable
workflow orchestration API contract; Owner 4 implements shared worker execution
with Owner 2. Each owner owns their task handlers and draft adapters. Owner 3
owns save and public media contracts; Owner 4 owns avatar generation. Sharing a
dependency does not authorize parallel edits to the same file.

## 2. Shared contract gate

By 00:30, publish and acknowledge:

- `fashion-item.v1`, field provenance, effective-value precedence, six
  categories, structured missing briefs, ownership status and explanation
  envelopes from FASHION-STRUCTURE.md.
- Preference normalization including `skin_depth`, explicit skin swatch ID and
  hex, optional body illustration and selected fit constraints.
- Draft and operation IDs, revisions, statuses, input fingerprints, replay
  events, idempotency, cancellation and stale-result rejection.
- Exact three option types, per-option product state, immutable save semantics,
  avatar job association and public media projection.
- Provider model and endpoint choices, prompt version loading, concurrency and
  cost limits, worker execution environment and image limits.

Every fashion AI handler must load FASHION-PROMPT.md and relevant FASHION.md
guidance and validate against FASHION-STRUCTURE.md. None may invent a parallel
item schema.

## 3. Owner 1 work packages

| Task                             | Deliverable                                                                                                                 | Dependency and verification gate                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| O1.1 Canonical data              | Shared normalization, strict schemas, user corrections above inference, preference key mapping                              | Publish to all owners; test unknown values, category applicability, material aliases and skin-depth propagation.       |
| O1.2 State and operations schema | Reviewed draft, operation, event, fingerprint, media and candidate proposals                                                | Pair with Owners 2–4; migration and RLS checks; no ad hoc tables from other owners.                                    |
| O1.3 Wardrobe intake             | Category tabs, signed image upload, automatic photo description, editable confirmation and CRUD                             | FASHION-PROMPT.md plus FASHION-STRUCTURE.md; test spoofed images, multiple items, retry, image attachment and archive. |
| O1.4 Preferences                 | Visual sections, benefit examples, selectable swatches and body illustrations, skip and clear                               | Test optional values, draft restoration, selected appearance context and downstream invalidation.                      |
| O1.5 Profile and shell           | Shared name, direct feature navigation including Preview, persistent navigation, consistent buttons and skeleton primitives | Coordinate landing with Owner 2; preserve mobile drawer and collapsed navigation; no false progress-loss guard.        |
| O1.6 Ownership and imports       | Candidate status, explicit Mark as owned, image-source provenance                                                           | Owner 3 import calls; all owned-only queries exclude candidates.                                                       |
| O1.7 Schema release              | Generated types and reviewed incremental rollout                                                                            | Validate policy and parent scope; no hosted reset; record pending constraint validation.                               |

## 4. Owner 2 work packages

| Task                  | Deliverable                                                                                                       | Dependency and verification gate                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| O2.1 Landing          | Autoplay feature demonstration, visual About, image-led hierarchy and feature navbar                              | DESIGN.md; local illustrative demo only; reduced motion and pause.                     |
| O2.2 Create state     | Top five-step tracker, upload draft, backward navigation, resume and adjacent Analyze CTA                         | O1.2 draft contract; no duplicate calls on return; future steps cannot be skipped.     |
| O2.3 Early analysis   | Verified upload starts description and independent confidence task in parallel                                    | Worker contract; FASHION-PROMPT.md; real provider and persisted results required.      |
| O2.4 Streaming review | Complete-item events, replay, partial validation, editable descriptions and visual evidence                       | FASHION-STRUCTURE.md; reconnect, invalid partial data and final reconciliation.        |
| O2.5 Editor           | Space-preserving fields, suggestions and free text, add and remove, conflict recovery                             | Revision-aware persistence; retain draft on 409; confirm destructive application.      |
| O2.6 Matching         | Separate read-only screen, three colored states, actual wardrobe images, strict functional eligibility            | O1 canonical owned inventory; football jersey and weak-evidence negative cases.        |
| O2.7 Recommendations  | Exactly three types, distinct reasons, useful missing-profile cards, no budget estimates, one-option regeneration | Matches and preferences current; valid IDs; empty wardrobe stays honest.               |
| O2.8 Handoff          | Committed options and operation events trigger Owner 3 prefetch; detail route preserves option identity           | Switch options and back without losing results; signed media never stored as identity. |

## 5. Owner 3 work packages

| Task                        | Deliverable                                                                              | Dependency and verification gate                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| O3.1 Selected detail        | Readable option tabs, concise reasons, missing callout near top, integrated marketplace  | Owner 2 option contract; no separate shopping step; correct active colors and save label.      |
| O3.2 Search orchestration   | Automatic, parallel missing-slot searches with per-option caching and partial results    | Shared worker and search quota; three independent slots overlap; tab switching reuses results. |
| O3.3 Value evidence         | Transparent weights, factors, unknown data and source timestamps                         | Same-currency comparisons; no invented ratings or shipping; score version retained.            |
| O3.4 Product import         | Save to wardrobe on every result with image and canonical description                    | O1 candidate contract; restricted image fetch, deduplication, retry and ownership distinction. |
| O3.5 Save and media trigger | Immutable snapshot plus atomic avatar outbox; saved status independent from image status | Owner 4 avatar handler; repeated save is idempotent; image failure preserves save.             |
| O3.6 Saved collection       | Image-led browse and detail, media progress and retry, resumable pagination              | Snapshot immutability and stale source handling.                                               |
| O3.7 Social Fit             | Image-led public page, approved avatar and grid, catchphrase, expiry and revocation      | O1 public-media schema; token-bound bytes and metadata; no profile leakage.                    |

## 6. Owner 4 work packages

| Task                          | Deliverable                                                                                          | Dependency and verification gate                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| O4.1 Worker                   | Durable claims, retry, recovery, quotas and safe event publication                                   | Joint operation contract with Owner 2; actual deployment required; no promise-only background work. |
| O4.2 Capsule wizard           | Five editable templates, four short visual steps and persisted draft                                 | O1 draft schema; all template fields mapped, no invented inventory, reset confirmation.             |
| O4.3 Capsule reasoning        | Multiple distinct combinations, short reasons and reusable missing additions                         | FASHION-PROMPT.md, FASHION.md, FASHION-STRUCTURE.md; text and IDs only; real reuse evidence.        |
| O4.4 Capsule persistence      | Owned combinations and explicit proposed missing slots, edit and delete, saved-look conversion       | O1 reviewed slot contract; required and excluded items, stale revision and token validation.        |
| O4.5 Unified preview          | Primary route, category tabs, optional categories, no mode selector or consent checkbox, save action | O1 preview contract; no fabricated acknowledgment; min one item and unique IDs.                     |
| O4.6 Avatar generation        | Selected skin swatch, undertone, body and fit context, natural pose, real output asset               | FASHION-PROMPT.md and FASHION-STRUCTURE.md; provider limits, mismatch and failure handling.         |
| O4.7 Saved avatar integration | Consume save outbox, attach media, reuse matching preview, retry without duplicate save              | O3 immutable snapshot and media contract; shared-image publication only after approval.             |

## 7. Seven-hour schedule and integration checkpoints

| Time             | Required outcome                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 00:00–00:30      | Agree contracts, owners, models, migration proposals, worker host, safety boundaries and acceptance cases.                                                                                 |
| 00:30–02:00      | Parallel foundations: canonical data and visual preference inputs; Create state and streaming path; selected shopping composition; capsule wizard and worker skeleton with real execution. |
| 02:00 checkpoint | Integrate upload, persisted draft and first real analysis; verify schema and job consumers agree. All owners report blockers and evidence.                                                 |
| 02:00–04:00      | Complete review, strict matching and three directions; parallel marketplace; candidate imports; capsule generation; preview and automatic save-avatar linkage.                             |
| 04:00 checkpoint | Exercise cross-owner journey and resume behavior. Confirm real AI evidence and schema-compatible results.                                                                                  |
| 04:00–05:30      | Complete public media, rich explanations, visual empty states, failure recovery, all required feature actions and missing integration.                                                     |
| 05:30 checkpoint | Integration lock; no new shared schema or dependency without explicit coordination. List remaining gates rather than hiding them.                                                          |
| 05:30–06:00      | Resolve critical failures, migration and state races; prepare approved test data and cleanup.                                                                                              |
| 06:00–07:00      | Feature freeze and authorized verification of connected journeys, responsive behavior, provider failure and operational recovery; final owner reports.                                     |

The timebox is a target, not proof that every task will fit. Escalate blockers
promptly while retaining the full requested scope. Provider unavailability must
be reported honestly, with explicit sample exploration only when appropriate.

## 8. Contract-change and handoff format

Before editing another owner's area, publish: task ID, proposed fields and
types, exact request and response, constraints, source versions, affected
callers, migration needs, failure behavior and verification plan. The
accountable owner approves the contract through the team's normal coordination
channel; agents do not send external messages unless authorized.

At every checkpoint, update PROGRESS-NEW.md with requirement IDs, implemented
files, integration state, actual commands and results, provider evidence,
unresolved decisions, cleanup and next actions. Use not run when checks were
skipped. Do not commit, push or deploy without task authorization.
