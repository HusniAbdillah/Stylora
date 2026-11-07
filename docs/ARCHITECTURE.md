# Stylora application architecture

Use this design with [PRD.md](PRD.md), [TDD.md](TDD.md), [DESIGN.md](DESIGN.md),
[TASK.md](TASK.md), [RULES.md](RULES.md), [WORKFLOW.md](WORKFLOW.md), and the
[Owner 3 database brief](DATABASE.md). The PRD defines behavior. The TDD defines
the target interfaces. Reviewed migrations and generated types define the
executable database contract. [PROGRESS-NEW.md](PROGRESS-NEW.md) tracks what has
actually been verified.

## One deployable application with vertical slices

Use one Next.js App Router application on Vercel and one hosted Supabase
project. Each slice owns its screen, validation, use cases and scoped data
access. An owner can deliver a working route without editing a global
controller, service or repository for each change. Shared modules cover only
reused UI, the canonical fashion contract and infrastructure. Keep components
and schemas flat inside a feature until their size makes subfolders useful.
[Next.js project structure](https://nextjs.org/docs/app/getting-started/project-structure).

| Location                                    | Responsibility                                                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app`                                   | URLs, layouts, loading and error boundaries, HTTP and Server Action entry points. Put workspace pages in `(workspace)` and public shares outside that layout. |
| `src/features/<slice>`                      | Components, Zod schemas, scoped queries, mutations and domain rules. Create folders such as `components` or `queries` once the slice needs them.              |
| `src/components/ui`, `src/components/shell` | Accessible reusable primitives and workspace navigation from the design system.                                                                               |
| `src/lib/config`, `src/lib/supabase`        | Lazy server configuration and the privileged client paired with the configured workspace. Provider and storage adapters belong here when implemented.         |
| `src/prompts`, `src/types`                  | Versioned server prompt build inputs and generated database types. Domain DTOs remain with their slices.                                                      |
| `supabase/migrations`, `supabase/tests`     | Reviewed schema changes and policy tests. Owner 1 manages both.                                                                                               |

Pages are Server Components by default and call feature queries directly.
Interactive islands handle file picking, draft fields, stepper controls, events
and visual selection. An action or route handler validates its input, calls a
feature use case and returns a small DTO. Share the use case if both entry
points need the same mutation. Use route handlers for signed upload initiation,
events, public media and documented HTTP contracts. Apply dependency direction
`app → feature → shared infrastructure`; cross-feature calls use a named
contract exported by the owning slice. A client component may import safe
schemas and DTOs. Mark any module that holds secrets or performs privileged
reads with `server-only`.
[Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components).

## Ownership and route boundaries

These are target routes. The scaffold currently exposes `/` and `/api/health`.

| Owner   | Slice                                      | Target entry points and boundaries                                                                                                                                                                                                    |
| ------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | Wardrobe, preferences, profile             | `/wardrobe`, `/wardrobe/[itemId]`, `/preferences`, `/profile`. Publish active owned inventory, canonical item conversion and a versioned preference snapshot.                                                                         |
| 2       | Inspiration, matching, inspiration outfits | `/`, `/create`, `/looks/[lookId]?step=review\|matches\|ideas`. Inspiration owns corrections and progress. Matching owns deterministic eligibility. Outfit generation owns the three option types and per-direction regeneration.      |
| 3       | Products, decisions, sharing               | `/looks/[lookId]?option_id=…`, `/saved-looks`, `/saved-looks/[savedLookId]`, its share review, and `/shared/[shareToken]`. Products owns search and scoring. Decisions owns selections and saves. Sharing owns the public projection. |
| 4       | Capsules, preview                          | `/capsules`, `/capsules/new`, `/capsules/[capsuleId]`, its outfit detail, and `/preview`. Capsules owns combination and reuse rules. Preview owns interactive selection and saved-avatar execution.                                   |
| 2 and 4 | Operations                                 | Draft and operation endpoints. Owner 2 publishes the protocol. Owner 4 implements runner integration. Each slice owns its own task handler and domain commit.                                                                         |

Use one thin `/looks/[lookId]` page to dispatch validated views. Resolve a
detail option against that look and workspace. Accept either a step or an
option selector and recover ambiguous requests at the last valid visited
step. Check visited and ready steps against persisted progress before
rendering. A forward action can
navigate once its own input is saved. The destination owns its skeleton,
partial result, retry and error state. Outfit-detail shopping stays on the same
page, and Preview gets its own navigation entry.

## Data and transaction boundaries

- **Workspace.** Derive the workspace from `STYLORA_WORKSPACE_ID` in server
  code. Apply it explicitly to every read, write, RPC and child relation.
  Pair composite workspace foreign keys with parent membership checks. Enable
  RLS and explicitly deny direct `anon` and `authenticated` access. The
  secret-key client bypasses RLS, so the migration tests and privileged query
  tests cover different boundaries. Gate mutations and chargeable starts with
  the shared write flag. All visitors in an enabled workspace share its data.
  [Supabase secure data](https://supabase.com/docs/guides/database/secure-data).
- **Canonical data.** Translate stored snake case to camel case once at the
  persistence boundary. Use one `fashion-item.v1` schema and one explanation
  envelope from [FASHION-STRUCTURE.md](FASHION-STRUCTURE.md). Preserve evidence
  and original readings when corrections override effective values. Distinguish
  user selections, catalog facts, appearance observations and unknown values.
  Keep database identifiers and asset references separate from provider output.
- **Draft and concurrency.** Persist meaningful fields, visited steps and
  selected IDs in workspace drafts and domain rows. Put shareable view
  coordinates such as an option ID in the URL. Keep transient typing and focus
  local to the form. Mutations take an expected revision, check it atomically,
  and return a conflict that lets the editor keep its draft. Use idempotency
  keys for repeated commands. Revalidate affected views after a commit.
- **Uploads and images.** Issue a signed upload for a random workspace path
  in a private bucket. The browser uploads bytes directly to Storage. Verify
  size, type and actual bytes before attaching the asset or starting inference.
  Persist asset IDs and paths. Sign display URLs after scope checks and
  preserve media referenced by snapshots. Use a restricted import path for
  catalog media and recheck redirects.
  [Supabase signed uploads](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl).
- **Inventory and shopping.** Provide a single active owned query for matching,
  outfit options and capsules. Candidate import writes through Wardrobe with
  its own idempotency key and changes eligibility only on explicit promotion.
  Products searches missing slots with bounded concurrency and independent
  result state. Value Score normalizes weights over available evidence and
  compares price within a currency.
- **Save and share.** Insert the immutable outfit snapshot and its avatar
  operation in the same transaction. Store image status independently and
  retry by operation identity. Share publishes a reviewed allowlist with a
  hashed token, expiry and revocation. Recheck those fields and approved media
  membership on every public data or media request. Serve those responses
  with `no-store` so an old cache cannot extend access after revocation.

### Resolve before freezing the schema

| Gap in the specs                                                                                              | Proposed resolution                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD R28 requires selection restoration per option, while `DATABASE.md` describes one selection per look.      | Keep the active option on the look or draft. Scope saved slot choices by workspace, look, option and slot, and enforce option and slot parent membership. A regenerated option revision invalidates only its dependent selection and search state. |
| The TDD describes `workspace_id` on all tables and also names `workspaces` as the workspace root.             | Use `workspaces.id` as the root identifier. Dependent tables carry `workspace_id`; scoped composite keys prevent cross-workspace references. Confirm each compound parent relationship in the migration review.                                    |
| The PRD needs persisted jobs and execution. Option A in the TDD resumes abandoned work when a client returns. | Implement the documented Option A flow with awaited handlers and lease recovery. Record the observed navigation and restart limits. Autonomous execution after browser or server interruption requires Option B with a deployed consumer.          |
| The TDD models canonical JSON and the Owner 3 brief offers only selected product attributes.                  | Review product persistence against the canonical item contract and keep provider offer fields separate. Use one mapping and a schema-supported missing-brief representation across outfits and capsules.                                           |

## Provider execution and recovery

Start description and confidence independently after upload verification.
After review stabilizes, run matching with deterministic category, function,
occasion and construction gates before ranking. Use the committed match
revision for the three outfit directions. Once those options commit, search
missing slots in parallel with a pool of three. A failed confidence or shopping
operation leaves its siblings available. Regeneration affects one direction
and keeps the previous valid result available until the replacement commits.

Persist each operation's workspace, subject, kind, input revision, fingerprint,
lease, status and result reference. Atomically claim execution and compare the
fingerprint again before applying a result. Include only real dependencies
in each fingerprint, such as preference and owned-inventory revisions,
provider and prompt versions, or shopping region. Use stable event sequence
numbers and a bounded replay or polling path. Emit only complete validated
pieces and treat them as provisional until final validation. Verify strict
streaming with the configured OpenAI endpoint, then use the TDD's manifest and
per-piece fallback if needed.

Keep the provider transport server-side. Assemble the canonical
[FASHION-PROMPT.md](FASHION-PROMPT.md), relevant
[FASHION.md](FASHION.md) sections, the task schema derived from
[FASHION-STRUCTURE.md](FASHION-STRUCTURE.md), then delimited untrusted context.
Bundle these inputs at build time so they are available in Vercel functions,
and verify their contents and versions in the assembled request. Validate
provider output with Zod and then check allowed IDs, ownership, applicability
and evidence. Only use actual selected preferences. Capsule reasoning sends
text and IDs. Preview uses the explicit swatch, appearance preferences and
authorized garment references for an illustrative avatar.
[Vercel Function duration](https://vercel.com/docs/functions/configuring-functions/duration).

## Delivery and verification

1. **Owner 1 contract gate.** Review the workspace, canonical item and
   preferences, private asset, draft, operation and revision contracts. Create
   the baseline via the CLI, validate schema and policies in an approved
   environment, then generate `src/types/database.ts` from the reviewed schema.
2. **First connected increment.** Join verified inspiration upload,
   description and confidence, correction, and owned wardrobe intake.
   Demonstrate restore after navigation and reload, complete item events,
   revision conflict and independent retry.
3. **Connect downstream slices.** Validate matches, three directions,
   per-option shopping, candidate import, capsule combinations, preview and
   immutable save. Verify avatar failure leaves the saved look intact.
4. **Verify the public and deployment boundaries.** Test share expiry,
   revocation and media access; direct table denial and foreign parents;
   mobile and desktop layouts, keyboard and reduced motion; then verify real
   provider calls and resume behavior in the assigned Preview workspace.

Use Vercel's Next.js defaults with Node 22 and the pinned pnpm lockfile.
Supply runtime variables per environment. Each developer uses their assigned
hosted workspace, Vercel Preview uses the preview workspace, and Production
uses the demo workspace. Keep CLI credentials in Owner 1's shell. Set the
write flag deliberately per environment and give provider budgets independent
limits. A green build and health response establish code and configuration
readiness. Verify hosted connectivity, migrations, provider limits and user
journeys separately.
[Vercel environment variables](https://vercel.com/docs/environment-variables).
