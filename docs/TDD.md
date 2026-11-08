# Stylora technical design documentation

Version: 1.0, prepared 6 November 2026 for the seven-hour build. This is the
target technical design: the routes, contracts, data model, background
execution, prompting and verification the team builds during the event.
Required product behavior is defined in [PRD.md](PRD.md); visual behavior in
[DESIGN.md](DESIGN.md); delivery rhythm in [WORKFLOW.md](WORKFLOW.md). Nothing
in this document is a claim that any part is built or verified; evidence
belongs in [PROGRESS-NEW.md](PROGRESS-NEW.md).

## 1. Conventions

**Required** means behavior the build must implement. **Contract** means a
shape that owners agree on at 00:30 and change only through the process in
[TASK.md](TASK.md) section 8. **Decision** means an open choice the team makes
early and records in PROGRESS-NEW.md.

Every item-bearing surface uses [FASHION-STRUCTURE.md](FASHION-STRUCTURE.md).
Every fashion LLM task uses [FASHION-PROMPT.md](FASHION-PROMPT.md) plus the
relevant [FASHION.md](FASHION.md) sections. The prompt text must be loaded into
the request; a filename alone supplies no knowledge to an API model. Item
descriptions and recommendation explanations are distinct typed objects.

## 2. Stack and project structure

| Area       | Planned choice                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| Runtime    | Node 22, pnpm                                                                                                              |
| App        | Next.js App Router, React, strict TypeScript, deployed on Vercel                                                           |
| Validation | Zod for every request, action, query parameter and provider output                                                         |
| Data       | Hosted Supabase PostgreSQL and private Storage through the Supabase JS client, server only                                 |
| AI         | OpenAI API: `gpt-5-mini` for text and vision, `gpt-image-1.5` for images; server-only HTTP transport                       |
| Shopping   | SerpAPI Google Shopping                                                                                                    |
| UI         | Tailwind CSS with tokens from the Figma `Stylora / Light` collection, Radix primitives, Motion, Inter and Instrument Serif |
| Checks     | ESLint, TypeScript, Vitest, Prettier; GitHub Actions on every pull request                                                 |

Planned folder convention, described rather than listed as files that exist:

- The app folder under the source root holds thin routes, layouts, route
  handlers, and loading and error boundaries.
- A features folder holds one subfolder per feature, each with its schemas,
  components, actions, queries and services as needed.
- A shared components folder holds the shell and UI primitives (Owner 1).
- A library folder holds the provider clients with prompt assembly, the
  server-only privileged Supabase client, and the lazy server configuration
  validation.
- The generated database types live in one types file that is never edited by
  hand.
- A Supabase folder holds the migration history.
- A prompts folder holds the versioned FASHION-PROMPT.md text that is compiled
  into requests.

Feature folders: `inspiration`, `matching`, `outfits`, `products`,
`decisions`, `sharing`, `wardrobe`, `preferences`, `profile`, `capsules`,
`preview`, `operations`.

There is one shared workspace and no authentication. Every database call and
child relation check uses the server-side `STYLORA_WORKSPACE_ID`. A route
parameter identifies a resource, never a workspace. RLS is enabled on every
table and denies direct anon and authenticated access; the server uses the
secret key, so application predicates remain mandatory and are audited.

### Configuration

Runtime variables: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
`STYLORA_WORKSPACE_ID`, `DEMO_WRITES_ENABLED`, `MODEL_API_KEY`,
`SERPAPI_API_KEY`. CLI variables: `SUPABASE_PROJECT_ID`,
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`. Values never appear in
documents, logs or client bundles. `DEMO_WRITES_ENABLED` is a shared write gate,
not authentication. Configuration is validated lazily so unconfigured providers
render an explicit unavailable state.

Frontend and backend run together with `pnpm dev`. The browser calls Next route
handlers and Server Actions. Browser uploads use a server-issued signed Storage
URL; there is no browser Supabase client.

## 3. Routes and pages

Every route has a `loading.tsx` skeleton shaped like its layout, an error
boundary with retry, and restores its draft. Frame IDs refer to the Figma pages
04 and 05.

| Route                                      | Purpose and layout                                                                                     | Frames                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `/`                                        | Editorial landing, autoplay illustrative demo with pause, feature bento, About, CTA. No live AI calls  | D01, M01                            |
| Workspace shell                            | Sidebar (expanded and icon rail), mobile drawer, bell with Activity panel, toasts                      | D17, D30, M14                       |
| `/create`                                  | Step 1 Upload: image panel with adjacent Analyze, occasion, preference card, parallel background tasks | D02, M02                            |
| `/looks/[lookId]?step=review`              | Step 2 Review pieces: reference, streamed pieces, Review with confidence, editor drawer                | D03, D18, M03, M16                  |
| `/looks/[lookId]?step=matches`             | Step 3 Wardrobe match: counts, owned and alternative photos, missing briefs, rejected candidate notes  | D04, M04                            |
| `/looks/[lookId]?step=ideas`               | Step 4 Outfit ideas: three fixed directions, regeneration, empty and missing-preference cards          | D05, D19, M05                       |
| `/looks/[lookId]?option_id=…`              | Step 5 Outfit details with integrated marketplace, Save this look                                      | D06, M06                            |
| `/wardrobe`                                | Category tabs, search, owned and candidate filter, image grid, upload-only add drawer, empty state     | D07, D08, D21, M07, M15, M17        |
| `/wardrobe/[itemId]`                       | Inline item detail editing, field provenance, Mark as owned, save changes, delete with confirmation           | D20, D22                            |
| `/preferences`                             | Visual preference sections with explanations and examples                                              | D09, M08                            |
| `/profile`                                 | Shared display name and workspace scope notice                                                         | D29                                 |
| `/capsules`                                | Capsule collection with drafts                                                                         | D25                                 |
| `/capsules/new`                            | Four-step wizard: Template, Purpose and context, Style and practicality, Items                         | D10, D11, D23, D24, M09, M19 to M21 |
| `/capsules/[capsuleId]`                    | Capsule result: owned-only outfits, outfits with an addition, reuse card                               | D12, M10                            |
| `/capsules/[capsuleId]/outfits/[outfitId]` | Outfit detail, Why this, save as look, delete                                                          | D26                                 |
| `/preview`                                 | Category-tab selection, avatar canvas with job status, profile summary, Save this look                 | D13, M11                            |
| `/saved-looks`                             | Avatar-first grid with preparing and failed states                                                     | D14, M12                            |
| `/saved-looks/[savedLookId]`               | Immutable snapshot, avatar, share status, regenerate image, delete                                     | D27, M18                            |
| `/saved-looks/[savedLookId]/share`         | Share review dialog: exact public preview, catchphrase, expiry, link, turn off                         | D15                                 |
| `/shared/[shareToken]`                     | Public image-led page; unavailable page when revoked or expired                                        | D16, D28, M13, M22                  |
| `not-found`, `error`                       | 404 and recoverable error with reference code                                                          | D31                                 |

Contextual entries such as previewing a saved look or a capsule outfit open
`/preview` seeded with that selection; they are not separate preview modes.

## 4. API contracts

A successful response wraps its payload in a single data property. A failure
returns a single error object carrying a code, a message, a retryable flag and
an optional operation ID. Mutable data is sent with a no-store cache directive.
Persisted JSON uses snake case and TypeScript DTOs use camel case, joined by one
explicit adapter.

### Create flow

| Method and path                                                   | Input                              | Behavior                                                                                          |
| ----------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| POST `/api/inspiration/uploads`                                   | `fileName`, `mimeType`, `byteSize` | Validate type and size, create pending asset with random workspace path, return signed upload URL |
| POST `/api/workflow-drafts`                                       | Feature kind, optional subject     | Create draft; return ID and revision                                                              |
| GET, PATCH `/api/workflow-drafts/[draftId]`                       | Expected revision, allowed fields  | Restore or update draft                                                                           |
| POST `/api/workflow-drafts/[draftId]/operations`                  | Task kind                          | Server checks readiness and starts or returns the operation for the input fingerprint             |
| GET `/api/workflow-operations/[operationId]`                      | —                                  | Status, revision, result reference                                                                |
| GET `/api/workflow-operations/[operationId]/events`               | Last event ID                      | Server-sent events with replay; bounded polling fallback                                          |
| POST `/api/workflow-operations/[operationId]/retry`, `/cancel`    | —                                  | Retry eligible failures; idempotent cancel                                                        |
| GET `/api/looks/[lookId]`                                         | —                                  | Look, pieces, confidence review, matches, options, transient image URLs                           |
| PATCH `/api/looks/[lookId]/pieces`                                | `expectedRevision`, pieces         | Atomic add, edit, remove; 409 on conflict; invalidates dependent results                          |
| POST `/api/looks/[lookId]/outfit-options/[optionType]/regenerate` | `expectedRevision`                 | Replace one option atomically; others unchanged                                                   |
| POST `/api/looks/sample`                                          | —                                  | Explicit labeled sample look, never a fallback for a failed live request                          |

### Shopping, saving and sharing

| Method and path                                                  | Input                                                  | Behavior                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| POST `/api/looks/[lookId]/products/search`                       | `optionId`, `optionItemId`, optional query and weights | One slot per request; the orchestrator runs slots in parallel        |
| GET `/api/looks/[lookId]/products`                               | `optionId`                                             | Cached results per slot, factors, score version                      |
| PUT `/api/looks/[lookId]/selection`                              | `optionId`, `expectedRevision`, slot choices           | Atomic per-slot selection; selection never creates ownership         |
| POST `/api/products/[productId]/wardrobe`                        | Idempotency key, source revision                       | Import image and canonical description as a saved candidate          |
| POST `/api/looks/[lookId]/save`                                  | `optionId`, `expectedRevision`, idempotency key        | Immutable snapshot plus avatar operation in one transaction          |
| GET `/api/saved-looks`, `/api/saved-looks/[id]`                  | Pagination                                             | Snapshots with media status                                          |
| POST `/api/saved-looks/[id]/media/retry`                         | —                                                      | Retry the avatar only                                                |
| POST `/api/saved-looks/[id]/shares`                              | Catchphrase up to 240 chars, expiry 1 to 720 hours     | Random token returned once, hash stored, allowlisted public snapshot |
| DELETE `/api/shares/[shareId]`                                   | —                                                      | One-way revocation                                                   |
| GET `/api/shared/[token]`, `/api/shared/[token]/media/[mediaId]` | —                                                      | Hash, expiry, revocation and membership checked on every read        |

### Wardrobe, preferences, capsules, preview

| Method and path                                                    | Behavior                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| POST `/api/wardrobe/uploads`                                       | Signed upload for a new item draft                                            |
| POST `/api/wardrobe/drafts/[draftId]/analyze`                      | Wardrobe description task; returns proposed items, one per garment            |
| Server Actions                                                     | Confirm item, save edits, delete item, Mark as owned            |
| Server Actions                                                     | Save preferences and profile name with revision checks                        |
| GET, POST `/api/capsules`; GET, PATCH, DELETE `/api/capsules/[id]` | Capsule CRUD with revision                                                    |
| POST `/api/capsules/[id]/generate`                                 | Starts capsule generation from text and IDs once brief and items are complete |
| POST `/api/previews`                                               | Selection refs, idempotency key; starts the avatar operation                  |
| GET `/api/health`                                                  | Configuration readiness without secrets                                       |

No public endpoint accepts arbitrary prompts, arbitrary image URLs or a
workspace ID.

## 5. Data model

All tables carry `workspace_id`; children use composite foreign keys on
`(workspace_id, id)` so a row cannot reference another workspace or another
parent. Timestamps are UTC; money is integer minor units with currency.

| Table                                                                  | Responsibility                                                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `workspaces`                                                           | Demo, preview and developer workspaces                                                                  |
| `assets`                                                               | Bucket, random path, MIME, bytes, source type, lifecycle                                                |
| `user_preferences`                                                     | Versioned style DNA, skin swatch ID and hex, undertone, body reference, fit and life preferences        |
| `wardrobe_items`                                                       | Canonical item fields, attributes, provenance, corrections, `inventory_status`, product source, archive |
| `looks`                                                                | Inspiration asset, occasion, status, revision                                                           |
| `inspiration_pieces`                                                   | Canonical pieces with provenance and order                                                              |
| `look_reviews`                                                         | Review with confidence result tied to image, occasion and preference revision                           |
| `wardrobe_matches`                                                     | Piece to owned item, type, shared attributes, differences, explanation, rejected candidates             |
| `outfit_options`, `outfit_option_items`                                | Three fixed types; slots referencing owned, product or structured missing brief                         |
| `products`, `shopping_searches`, `shopping_results`                    | Provider identity, offer fields, per-slot searches, factors and score version                           |
| `look_selections`, `look_selection_items`                              | Current per-slot choices                                                                                |
| `saved_look_snapshots`, `saved_look_media`                             | Immutable snapshot and avatar media status                                                              |
| `share_links`                                                          | Token hash, public snapshot, approved media, catchphrase, expiry, revocation                            |
| `capsules`, `capsule_items`, `capsule_outfits`, `capsule_outfit_items` | Brief, owned membership, outfits, proposed missing slots                                                |
| `workflow_drafts`                                                      | Feature drafts, visited steps, last step, revision                                                      |
| `workflow_operations`, `workflow_operation_events`                     | Operation identity, fingerprint, status, lease, result reference, replayable events                     |

Atomic database functions: save inspiration revision, persist look results,
regenerate one option, select products, save snapshot with media outbox, create
share link, create capsule, save capsule outfit, start operation.

The whole schema is one reviewed baseline migration created by Owner 1 at the
start of the event, followed by additive migrations only (WORKFLOW.md section
2).

## 6. Canonical data adapters

All features use `fashion-item.v1` from FASHION-STRUCTURE.md through one server
normalization adapter that produces effective values with precedence: user
correction, verified catalog fact, visual inference, unknown. Rules:

- Use `apparentMaterial` everywhere; never a bare `material` from vision.
- Preferences use one key set (`skin_depth`, `skinSwatchId`, `skinSwatchHex`,
  `undertone`, and so on) mapped once at the boundary and passed to every task.
- Category equality never proves suitability; matching applies role,
  functional family, occasion, coverage and construction gates first.
- A bag slot in the UI maps to the `accessory` storage category.
- Missing items are structured briefs with the canonical shape plus a search
  string projection.
- Explanations use the envelope from FASHION-STRUCTURE.md section 8: reasons,
  evidence references, inputs used, differences, uncertainty.
- Attribute JSON is validated with strict field-level schemas and a size limit;
  unknown values are omitted with their provenance kept.

Skin swatches for preferences and avatars: `depth_01 #F1D4C2`, `depth_02
#E3BFA7`, `depth_03 #CFA080`, `depth_04 #B9805D`, `depth_05 #8A573D`,
`depth_06 #543526`, plus skip. These are editable illustrative references, not
a scientific scale.

## 7. Persisted navigation and drafts

Create sequence: Upload, Review pieces, Wardrobe match, Outfit ideas, Outfit
details with marketplace. The stepper navigates back to visited steps only;
forward uses the primary action after prerequisites. Opening an earlier step
reads saved results and never re-runs AI.

| Surface                 | State retained                               | Storage                                             |
| ----------------------- | -------------------------------------------- | --------------------------------------------------- |
| Upload                  | Asset ID, occasion, task IDs                 | Server draft; File in IndexedDB only until uploaded |
| Review                  | Look revision, active piece, unsaved edit    | Server result; local mirror of unsaved input        |
| Matching and ideas      | Results per revision, regeneration status    | Server                                              |
| Details                 | Per-option search results, choices, weights  | Server per option revision; tab in URL              |
| Wardrobe                | Tab, search, filter, scroll, add draft       | URL and server draft                                |
| Preferences and profile | Unsaved draft and saved revision             | Server with local draft recovery                    |
| Capsules                | Wizard step, template, brief, items, results | Server draft and capsule revision                   |
| Preview                 | Selection, job IDs, result                   | Server draft                                        |
| Saved and share         | Pagination, catchphrase draft, expiry        | URL and server                                      |

Autosave after about 600 ms of inactivity and before navigation, with a Saved
indicator. Only an explicit discard clears a draft, with confirmation.
Preference changes invalidate personalized advice, ideas and new avatars;
wardrobe changes invalidate matching and combinations; neither deletes uploads,
reviewed descriptions or saved snapshots. Stale results show a notice and
refresh instead of silently overwriting.

## 8. Background execution, concurrency and recovery

### 8.1 Operations

`workflow_operations` fields: `id`, `workspace_id`, `kind`, `subject_type`,
`subject_id`, `input_revision`, `input_fingerprint`, `prompt_version`,
`schema_version`, `model`, `status`, `attempt_count`, `lease_until`,
`provider_request_id`, `result_ref`, `safe_error_code`, timestamps and
`cancel_requested_at`. States: `queued`, `running`, `partial`, `succeeded`,
`failed`, `cancelled`, `superseded`. A unique key over workspace, kind, subject
and fingerprint makes starts idempotent.

### 8.2 Execution decision

`STYLORA_EXECUTION_MODE=inline` retains the request executor for compatibility.
`worker` mode separates allocation from execution: routes persist the operation
and acknowledge it with HTTP 202; a separately supervised Node process scans the
configured workspace and invokes the authenticated internal executor. The
executor claims through the existing database RPC, awaits the provider within
the route budget, and commits with attempt, fingerprint and revision fences.
The browser only reads progress in worker mode. Closing it does not stop work.

The worker uses three text slots and one image slot. The database also enforces
one live image claim per workspace. Run one worker per workspace: Capsule does
not yet have a database-wide text-call semaphore across multiple processes.
Expired leases are recovered without a page visit. Failed tasks require an
explicit eligible retry; the scanner never blindly replays a paid failure.
External provider billing is not exactly once after a process crash.

Both the app and worker must remain available. This change provides an executor
over persisted operations without adding a queue service or migration. It does
not provision or deploy that executor. See `docs/AI-WORKER.md` for startup,
recovery, limits and local evaluation. Never treat a queued row as running work.

### 8.3 Readiness and task graph

| Operation                 | Complete input required                   | Earliest start               | Parallel with               |
| ------------------------- | ----------------------------------------- | ---------------------------- | --------------------------- |
| `inspiration_description` | Verified upload, stable optional occasion | Upload verified              | Confidence review           |
| `inspiration_confidence`  | Same image, optional occasion, preferences | Upload verified              | Description                 |
| `wardrobe_match`          | Accepted piece revision, owned inventory  | Stable review, no dirty edit | Confidence may still run    |
| `outfit_options`          | Matches, pieces, inventory, preferences   | Match committed              | —                           |
| `option_regeneration`     | One option type and current context       | Suggest another              | Other options stay usable   |
| `marketplace_search`      | Missing-slot brief, region, query         | Options committed            | Each slot, pool of three    |
| `wardrobe_description`    | Verified draft image                      | Upload verified              | —                           |
| `capsule_generation`      | Complete brief and selected owned items   | Wizard inputs stable         | —                           |
| `preview_image`           | Valid selection and preference snapshot   | Selection stable             | One image job per workspace |
| `saved_avatar`            | Committed snapshot                        | Save transaction             | Save is already complete    |

No task starts on an empty form, each keystroke, hover or unverified upload.
Clicking the forward action navigates and ensures one operation exists; it never
duplicates one already started.

Retries: authorization and schema failures are terminal until input or
configuration changes; network, 429 and eligible 5xx errors get at most two
retries with backoff and jitter, honoring Retry-After. Revision conflicts reload
instead of replaying.

### 8.4 Invalidation

Fingerprints include asset identity, occasion, piece revision, effective item
attributes, inventory revision, preference revision, prompt and schema version
and model; searches add region, currency and query; avatars add snapshot,
swatch, pose intent and output settings. At commit, a changed fingerprint marks
the operation superseded and never overwrites newer data.

## 9. Incremental description streaming

The review shows each piece once its full object validates. First try provider
streaming with strict structured output for the exact model and endpoint
([OpenAI streaming](https://developers.openai.com/api/docs/guides/streaming-responses),
[Meta structured output](https://dev.meta.ai/docs/structured-output)). Parse
the stream with a proper incremental JSON parser and emit `piece_completed`
only when a whole piece passes its schema. If strict streaming is not
supported, use the fallback: a lightweight manifest call, then parallel
per-piece detail calls on the same image. Never fake streaming by delaying a
complete response.

Event envelope: `eventId`, `operationId`, `sourceRevision`, `sequence`, `type`
(`started`, `piece_completed`, `confidence_completed`, `completed`, `failed`,
`superseded`), `payload`. Events are stored for replay; reconnect uses the last
event ID. The final response passes full validation before the look revision
commits; a failed final step leaves provisional pieces marked incomplete with
retry and manual adoption.

## 10. Page-specific design

### 10.1 Landing and shell

Server-render editorial content; the demo is a client island using Motion with
pause, offscreen suspension and a static reduced-motion frame. Navbar links go
to feature routes. The shell includes Preview, the bell with the Activity panel
listing live operations, and toasts. Normal navigation never shows a
progress-loss warning.

### 10.2 Upload

Validate type and size, issue a signed upload to a random workspace path,
verify bytes, MIME and size before any model call, then start description and
confidence in parallel. Analyze inspiration navigates immediately to the look
or draft and renders its skeleton or cached events.

### 10.3 Review and editor

Reference image with contain sizing; piece cards with swatches, attribute
groups, evidence and a preference-aware For you note; the confidence review in
its own panel with independent states. The editor keeps raw typing, offers
suggestions with free text, fixes category to the six values and confirms
before applying changes that invalidate downstream results. On 409, keep the
draft, reload and offer reconcile.

### 10.4 Matching

Load owned, active items through the canonical adapter. Apply hard gates for
role, functional family, known occasion, coverage and construction, then rank
eligible candidates on comparable evidence only, excluding unknown fields from
agreement. Calibrate with negative cases: football jersey versus blouse, cleats
versus loafers, rain shell versus dinner jacket, low-evidence pairs. The LLM
explains eligible results using FASHION-PROMPT.md and cannot make an ineligible
item valid. Return real wardrobe image references for owned and alternative
results and record rejected candidates with a reason.

### 10.5 Three recommendations

Exactly `closest`, `from_wardrobe` and `fresh_alternative`, validated against
allowed IDs; `from_wardrobe` uses owned items only and is honestly unavailable
when inventory cannot support it. No budget estimates. Each option carries a
concept, ordered slots, two to four reasons, inputs used, differences and
uncertainty. Regeneration replaces one option atomically and keeps the old card
visible until the new one validates.

### 10.6 Selected outfit and shopping

Details render the composition, option tabs and the marketplace together. Start
missing-slot searches when options commit; run up to three at once; cache per
option revision and brief; show each slot as it finishes. Product cards show
source, price and currency, rating or its absence, retrieval time and a
validated seller link. Value Score defaults: price 0.3, rating 0.2, relevance
0.5, normalized over available factors, same-currency only, versioned and
explained. Save to wardrobe imports from allowed image hosts only, checks
redirects, size and MIME, deduplicates and creates a saved candidate.

### 10.7 Wardrobe and preferences

Upload-only intake with a description task; multiple garments return separate
proposals. Item detail shows provenance per field, candidate status with Mark as
owned, save inline edits and delete with confirmation. Preferences save stable
swatch IDs and hex, undertone, contrast, body illustration ID and proportions,
fit, style, climate, coverage, footwear and care; skipped fields stay absent.

### 10.8 Capsules

Four-step wizard with five templates that fill editable defaults; replacing a
template after edits asks first. Generation uses text and IDs only, enforces
required and excluded items, returns three to six distinct outfits and up to
three missing additions, each linked to the owned items and outfits it unlocks.
Owned-only outfits and outfits with additions display separately.

### 10.9 Preview and saved avatars

One category-tab selector, one item per displayed slot, optional slots, at least
one item. No consent checkbox; a short limitations note instead. Prompts include
FASHION-PROMPT.md, canonical items and the complete preference snapshot: skin
swatch ID and hex, undertone, body reference, proportions, fit intent and a
natural pose chosen for the outfit. Output 1024 by 1536 PNG unless the provider
limits differ. Saving creates the snapshot and the avatar operation together;
image failure never rolls back the save, and a matching completed preview is
reused.

### 10.10 Saved and public looks

Saved grid and detail lead with the avatar and show preparing and failed states
that still identify the outfit. Sharing previews exactly what becomes public:
avatar, title, catchphrase and item grid. Public media is served only through a
token-checked endpoint; revoked or expired links show an unavailable page.

## 11. Storage and security

Private buckets `inspiration`, `wardrobe`, `previews`. Lifecycle: allocate
pending asset, signed upload, verify bytes and metadata, attach atomically,
serve short-lived signed URLs, mark detached or deleted, clean up. Signed URLs
are never stored or logged
([Supabase signed uploads](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl)).
Do not delete assets referenced by snapshots, previews or active shares.

Catalog image fetches use an allowlist, reject private addresses, recheck
redirects and cap bytes. Logs contain only operation ID, feature, safe code,
duration, usage and status. Rate limits apply per workspace with separate
budgets for prefetch and explicit retries.

## 12. Prompting and provider contract

Assembly order for every fashion task:

1. Application safety and schema rules.
2. Versioned FASHION-PROMPT.md text.
3. Relevant FASHION.md section.
4. Task instruction and the FASHION-STRUCTURE.md schema projection.
5. Untrusted data envelope: canonical items, allowed IDs, selected preferences,
   occasion, references, constraints.

Keep the core prompt around 3,000 to 5,000 tokens with a 6,000-token ceiling,
measured with provider tooling. Send only relevant inventory with complete
allowed IDs; rank server-side if the context is too large. Record prompt
version, schema version, model, input fingerprint, provider request ID, latency
and usage per operation. Validate with strict provider JSON schema, then Zod,
then domain checks.

| Task                        | Knowledge and output                                                        |
| --------------------------- | --------------------------------------------------------------------------- |
| Inspiration description     | Garment reading guidance; item objects with field provenance                |
| Review with confidence      | Color, proportion and preference guidance; structured evidence, inputs used |
| Match explanation           | Strict alternatives; shared and differing attributes for eligible IDs       |
| Three options, regeneration | Outfit composition; canonical slots and explanation envelope                |
| Wardrobe photo reading      | Same item schema, user facts preserved                                      |
| Capsule generation          | Capsule chapter; text and IDs only                                          |
| Shopping explanation        | Shopping integrity; no invented offer fields                                |
| Preview and saved avatar    | Visual direction; canonical items, preferences, swatch and pose             |
| Catchphrase                 | Sharing rules; public-safe concept only                                     |

## 13. Schema rollout

Owner 1 writes one baseline migration from section 5 at the start of the event,
applies it to the new hosted project after review, generates types and merges
them in the contracts pull request. Later changes are additive migrations with
the same review. No hosted reset, no edits to applied migrations, no schema
changes from the dashboard.

## 14. UI delivery and accessibility

[DESIGN.md](DESIGN.md) owns visual details. Tokens map one to one from the Figma
collection `Stylora / Light` to CSS custom properties. Paper labels on Crimson
`#73091D` buttons; Blush active tabs with Ink labels and a second cue. Sentence
case, no slash-separated labels. Skeletons reserve real dimensions and announce
loading once ([Next.js loading UI](https://nextjs.org/docs/app/api-reference/file-conventions/loading)).
Long text wraps; controls keep 44 px targets, labels, focus and keyboard
operation. Custom dialogs name the object and consequence, focus the safe action
and return focus.

## 15. Verification plan

| Gate                          | Cases                                                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| G1 Contract and schema        | Canonical validation, null semantics, preference key mapping, generated types match the migration               |
| G2 Data access                | Foreign workspace and wrong parent rejected; candidates excluded from owned queries; direct table access denied |
| G3 Upload                     | Type and size, spoofed MIME, missing object, expired URL, resume after navigation, orphan cleanup               |
| G4 Description and confidence | Real request, parallel timing, first piece before completion, schema rejection, independent retry               |
| G5 Corrections and state      | Multiword typing, suggestions, confirmation, revision conflict, reload                                          |
| G6 Matching                   | Real photos, credible alternatives, empty inventory, jersey and cleat negatives                                 |
| G7 Options                    | Three types, owned-only direction, no budgets, single regeneration, stale rejection                             |
| G8 Shopping                   | Parallel slots, isolated failures, cache on tab switch, nullable price and rating, candidate import             |
| G9 Capsule                    | Templates, step restore, text-only input, distinct outfits, addition reuse counts                               |
| G10 Preview and save          | Optional slots, preferences in prompt, pose instruction, no consent, save survives image failure                |
| G11 Share                     | Approved media only, no profile leakage, revoked and expired denied                                             |
| G12 Recovery                  | Navigation during jobs, expired lease, duplicate start, rate limit, superseded completion                       |
| G13 Responsive UI             | 1440, 1280, 768, 390 and 360 px; keyboard; 200 percent zoom; reduced motion; contrast                           |

Planned commands: `pnpm check` (lint, typecheck, unit tests), `pnpm build`,
database policy tests, and type generation. Online tests and seeding call
providers or change shared data and need team approval. A build does not prove
provider connectivity; a save with a failed avatar is partial success.

## 16. Requirement traceability

| PRD IDs | Sections           | Owner                                                        |
| ------- | ------------------ | ------------------------------------------------------------ |
| R01–R06 | 7, 8, 9, 14        | Owner 2 orchestration, all owners for drafts, Owner 1 schema |
| R07–R09 | 6, 10.3–10.5, 12   | Owner 2 with every AI consumer                               |
| R10–R11 | 10.1, 14           | Owner 1 primitives, all owners                               |
| R12–R14 | 3, 10.1            | Owner 2 landing, Owner 1 navigation                          |
| R15–R21 | 4, 8, 9, 10.2–10.3 | Owner 2                                                      |
| R22–R27 | 6, 10.4–10.5       | Owner 2                                                      |
| R28–R32 | 4, 8, 10.6, 11     | Owner 3 with Owner 1 import contract                         |
| R33–R36 | 6, 7, 10.7         | Owner 1                                                      |
| R37–R40 | 8, 10.8, 13        | Owner 4                                                      |
| R41–R43 | 8, 10.9, 11–13     | Owner 4                                                      |
| R44–R45 | 10.9–10.10, 13     | Owner 3 save and share, Owner 4 avatar                       |

## 17. Decisions to record early

1. Whether the chosen model supports strict structured streaming; otherwise use
   the manifest and per-piece fallback.
2. Execution option A or B and its stated limitation.
3. Provider account limits for images, image input size and request duration.
4. Allowed catalog image hosts and retention.
5. Whether generated avatars meet the swatch closely enough; exact color match
   is a target, not a guarantee.
6. Any scope that does not fit the timebox stays visible as unverified, never
   silently removed.
